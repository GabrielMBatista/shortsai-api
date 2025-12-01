import { prisma } from '@/lib/prisma';
import { GoogleGenAI, HarmCategory, HarmBlockThreshold, Modality } from "@google/genai";

// Video generation model types
export const VEO_MODELS = {
    'veo-2': 'veo-2.0-generate-001',           // 50 RPD - Best for high volume
    'veo-3': 'veo-3.0-generate-001',           // 10 RPD - Higher quality
    'veo-3-fast': 'veo-3.0-fast-generate-preview', // 10 RPD - Faster generation
    'veo-3.1': 'veo-3.1-generate-001',         // 10 RPD - Latest quality
    'veo-3.1-fast': 'veo-3.1-fast-generate-001' // 10 RPD - Latest + fast
} as const;

export type VeoModelType = keyof typeof VEO_MODELS;

// --- QUEUE & RETRY LOGIC ---
class RequestQueue {
    private queue: (() => Promise<void>)[] = [];
    private running = 0;
    private maxConcurrent = 3;

    async add<T>(task: () => Promise<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            const wrapper = async () => {
                try {
                    const result = await task();
                    resolve(result);
                } catch (e) {
                    reject(e);
                } finally {
                    this.running--;
                    this.processNext();
                }
            };
            this.queue.push(wrapper);
            this.processNext();
        });
    }

    private processNext() {
        if (this.running < this.maxConcurrent && this.queue.length > 0) {
            this.running++;
            const next = this.queue.shift();
            if (next) next();
        }
    }
}

const generationQueue = new RequestQueue();

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    retries = 3,
    baseDelay = 2000
): Promise<T> {
    try {
        return await fn();
    } catch (error: any) {
        const isQuotaError =
            error?.status === 429 ||
            error?.status === 503 ||
            (error?.message && error.message.includes("429")) ||
            (error?.message && error.message.includes("RESOURCE_EXHAUSTED"));

        if (retries > 0 && isQuotaError) {
            console.warn(`Quota hit(429).Retrying in ${baseDelay}ms... (${retries} retries left)`);
            await wait(baseDelay);
            return retryWithBackoff(fn, retries - 1, baseDelay * 2);
        }
        throw error;
    }
}

// --- AUDIO HELPERS ---
const base64ToUint8Array = (base64: string) => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
};

const uint8ArrayToBase64 = (bytes: Uint8Array) => {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
};

const createWavDataUri = (base64Pcm: string): string => {
    const pcmBytes = base64ToUint8Array(base64Pcm);
    const len = pcmBytes.length;

    const wavHeader = new ArrayBuffer(44);
    const view = new DataView(wavHeader);

    const writeString = (view: DataView, offset: number, string: string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + len, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, 24000, true); // 24kHz
    view.setUint32(28, 24000 * 2, true); // Byte rate
    view.setUint16(32, 2, true); // Block align
    view.setUint16(34, 16, true); // Bits per sample
    writeString(view, 36, 'data');
    view.setUint32(40, len, true);

    const headerBytes = new Uint8Array(wavHeader);
    const wavBytes = new Uint8Array(headerBytes.length + pcmBytes.length);
    wavBytes.set(headerBytes, 0);
    wavBytes.set(pcmBytes, headerBytes.length);

    return `data:audio/wav;base64,${uint8ArrayToBase64(wavBytes)}`;
};

const blobToBase64 = async (blob: Blob): Promise<string> => {
    // In Node environment, we use Buffer.
    return Buffer.from(await blob.arrayBuffer()).toString('base64');
};


export class AIService {

    // --- RATE LIMITING ---
    private static rpmCache = new Map<string, { count: number, resetAt: number }>();
    private static readonly RPM_LIMIT = 5; // 5 requests per minute per user

    private static async checkRateLimits(userId: string) {
        // 1. Check RPM (In-Memory)
        const now = Date.now();
        const userRpm = this.rpmCache.get(userId);

        if (userRpm && now < userRpm.resetAt) {
            if (userRpm.count >= this.RPM_LIMIT) {
                throw new Error("Rate limit exceeded (RPM). Please wait a moment.");
            }
            userRpm.count++;
        } else {
            this.rpmCache.set(userId, { count: 1, resetAt: now + 60000 });
        }

        // 2. Check RPD (Database)
        const limits = await prisma.userLimits.findUnique({ where: { user_id: userId } });

        // If no limits record exists, assume default (create one if needed, or just pass)
        // For now, let's assume if no record, we create one with defaults
        if (!limits) {
            await prisma.userLimits.create({ data: { user_id: userId } });
            return;
        }

        const today = new Date();
        const lastReset = new Date(limits.last_daily_reset);
        const isNewDay = today.getDate() !== lastReset.getDate() || today.getMonth() !== lastReset.getMonth();

        if (isNewDay) {
            await prisma.userLimits.update({
                where: { user_id: userId },
                data: {
                    current_daily_requests: 1,
                    current_daily_videos: 0,
                    last_daily_reset: today
                }
            });
        } else {
            if (limits.current_daily_requests >= limits.daily_requests_limit) {
                throw new Error(`Daily limit exceeded (${limits.daily_requests_limit} requests/day). Upgrade your plan.`);
            }
            await prisma.userLimits.update({
                where: { user_id: userId },
                data: { current_daily_requests: { increment: 1 } }
            });
        }
    }

    private static async executeRequest<T>(isSystem: boolean, task: () => Promise<T>, userId?: string): Promise<T> {
        if (isSystem) {
            if (userId) await this.checkRateLimits(userId);
            return generationQueue.add(() => retryWithBackoff(task));
        } else {
            return retryWithBackoff(task);
        }
    }

    private static async getGeminiClient(userId: string, providedKey?: string): Promise<{ client: GoogleGenAI, isSystem: boolean }> {
        if (providedKey) return { client: new GoogleGenAI({ apiKey: providedKey }), isSystem: false };

        const keys = await prisma.apiKey.findUnique({ where: { user_id: userId } });
        const userKey = keys?.gemini_key;

        if (userKey) return { client: new GoogleGenAI({ apiKey: userKey }), isSystem: false };

        const systemKey = process.env.GEMINI_API_KEY;
        if (!systemKey) throw new Error("Gemini API Key missing");

        return { client: new GoogleGenAI({ apiKey: systemKey }), isSystem: true };
    }

    private static async getElevenLabsKey(userId: string, providedKey?: string): Promise<{ key: string, isSystem: boolean }> {
        if (providedKey) return { key: providedKey, isSystem: false };

        const keys = await prisma.apiKey.findUnique({ where: { user_id: userId } });
        const userKey = keys?.elevenlabs_key;

        if (userKey) return { key: userKey, isSystem: false };

        const systemKey = process.env.ELEVENLABS_API_KEY;
        if (!systemKey) throw new Error("ElevenLabs API Key missing");

        return { key: systemKey, isSystem: true };
    }

    private static async getGroqKey(userId: string, providedKey?: string): Promise<{ key: string, isSystem: boolean }> {
        if (providedKey) return { key: providedKey, isSystem: false };

        const keys = await prisma.apiKey.findUnique({ where: { user_id: userId } });
        const userKey = keys?.groq_key;

        if (userKey) return { key: userKey, isSystem: false };

        const systemKey = process.env.GROQ_API_KEY;
        if (!systemKey) throw new Error("Groq API Key missing");

        return { key: systemKey, isSystem: true };
    }

    private static async trackUsage(userId: string, provider: string, model: string, type: 'image' | 'audio' | 'text' | 'music' | 'video') {
        console.log(`[Usage] User ${userId} used ${provider}/${model} for ${type}`);

        let action: any = 'GENERATE_SCRIPT';
        if (type === 'image') action = 'GENERATE_IMAGE';
        if (type === 'audio') action = 'GENERATE_TTS';
        if (type === 'music') action = 'GENERATE_MUSIC';
        if (type === 'text') action = 'GENERATE_SCRIPT';
        if (type === 'video') action = 'GENERATE_VIDEO';

        try {
            await prisma.usageLog.create({
                data: {
                    user_id: userId,
                    action_type: action,
                    provider: provider,
                    model_name: model,
                    status: 'success',
                    tokens_input: 0, // TODO: Count tokens
                    tokens_output: 0
                }
            });
        } catch (e) {
            console.error("Failed to log usage", e);
        }
    }

    static async generateImage(userId: string, prompt: string, style: string, keys?: { gemini?: string }): Promise<string> {
        const { client: ai, isSystem } = await this.getGeminiClient(userId, keys?.gemini);

        const fullPrompt = `Create a vertical (9:16) image in the style of ${style}. Scene: ${prompt}.`;

        return this.executeRequest(isSystem, async () => {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
                config: {
                    imageConfig: { aspectRatio: "9:16" },
                    safetySettings: [
                        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
                        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
                        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
                        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH }
                    ]
                }
            });

            await this.trackUsage(userId, 'gemini', 'gemini-2.5-flash-image', 'image');

            const candidate = response.candidates?.[0];
            if (candidate?.content?.parts) {
                for (const part of candidate.content.parts) {
                    if (part.inlineData?.data) {
                        return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
                    }
                }
                const textPart = candidate.content.parts.find(p => p.text);
                if (textPart?.text) {
                    throw new Error(`Model Refusal: ${textPart.text}`);
                }
            }
            throw new Error("Image generation failed - No image returned");
        }, userId);
    }

    static async generateAudio(userId: string, text: string, voice: string, provider: string, keys?: { gemini?: string, elevenlabs?: string, groq?: string }): Promise<{ url: string, timings?: any[], duration?: number }> {
        if (provider === 'elevenlabs') {
            return this.generateElevenLabsAudio(userId, text, voice, keys?.elevenlabs);
        } else if (provider === 'groq') {
            return this.generateGroqAudio(userId, text, voice, keys?.groq);
        } else {
            return this.generateGeminiAudio(userId, text, voice, keys?.gemini);
        }
    }

    private static async generateGroqAudio(userId: string, text: string, voiceName: string, providedKey?: string): Promise<{ url: string, timings?: any[], duration?: number }> {
        const { key: apiKey, isSystem } = await this.getGroqKey(userId, providedKey);
        const GROQ_API_URL = "https://api.groq.com/openai/v1/audio/speech";

        return this.executeRequest(isSystem, async () => {
            const response = await fetch(GROQ_API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: "playai-tts",
                    input: text,
                    voice: voiceName,
                    response_format: "wav"
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Groq API Error: ${errText}`);
            }

            await this.trackUsage(userId, 'groq', 'playai-tts', 'audio');

            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const base64Audio = buffer.toString('base64');
            const url = `data:audio/wav;base64,${base64Audio}`;

            let duration = 5;
            if (buffer.length > 44) {
                const byteRate = buffer.readUInt32LE(28);
                const dataSize = buffer.readUInt32LE(40);

                if (byteRate > 0 && dataSize > 0) {
                    duration = dataSize / byteRate;
                } else {
                    duration = buffer.length / 48000;
                }
            }

            return { url, duration };
        }, userId);
    }

    private static async generateElevenLabsAudio(userId: string, text: string, voiceId: string, providedKey?: string): Promise<{ url: string, timings?: any[] }> {
        const { key: apiKey, isSystem } = await this.getElevenLabsKey(userId, providedKey);
        const ELEVEN_LABS_API_URL = "https://api.elevenlabs.io/v1";
        const modelId = "eleven_multilingual_v2";

        return this.executeRequest(isSystem, async () => {
            const response = await fetch(`${ELEVEN_LABS_API_URL}/text-to-speech/${voiceId}/with-timestamps`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'xi-api-key': apiKey
                },
                body: JSON.stringify({
                    text: text,
                    model_id: modelId,
                    voice_settings: { stability: 0.5, similarity_boost: 0.75 }
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`ElevenLabs Error: ${errText}`);
            }

            await this.trackUsage(userId, 'elevenlabs', modelId, 'audio');

            const data = await response.json();
            const base64Audio = data.audio_base64;
            const alignment = data.alignment;

            let timings: any[] = [];
            if (alignment && alignment.characters && alignment.character_start_times_seconds) {
                const chars = alignment.characters;
                const starts = alignment.character_start_times_seconds;
                const ends = alignment.character_end_times_seconds;

                let currentWord = "";
                let wordStart = -1;
                let wordEnd = 0;

                for (let i = 0; i < chars.length; i++) {
                    const char = chars[i];
                    if (char === ' ') {
                        if (currentWord) {
                            timings.push({ word: currentWord, start: wordStart, end: wordEnd });
                            currentWord = "";
                            wordStart = -1;
                        }
                    } else {
                        if (wordStart === -1) wordStart = starts[i];
                        wordEnd = ends[i];
                        currentWord += char;
                    }
                }
                if (currentWord) {
                    timings.push({ word: currentWord, start: wordStart, end: wordEnd });
                }
            }

            const url = `data:audio/mpeg;base64,${base64Audio}`;

            let duration = 0;
            if (alignment && alignment.character_end_times_seconds && alignment.character_end_times_seconds.length > 0) {
                duration = alignment.character_end_times_seconds[alignment.character_end_times_seconds.length - 1];
            }

            return { url, timings, duration };
        }, userId);
    }

    private static async generateGeminiAudio(userId: string, text: string, voiceName: string, providedKey?: string): Promise<{ url: string, timings?: any[], duration?: number }> {
        const { client: ai, isSystem } = await this.getGeminiClient(userId, providedKey);

        return this.executeRequest(isSystem, async () => {
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash-preview-tts",
                contents: [{ role: 'user', parts: [{ text: text }] }],
                config: {
                    responseModalities: ["AUDIO"] as any,
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName || 'Kore' } } },
                },
            });

            await this.trackUsage(userId, 'gemini', 'gemini-2.5-flash-preview-tts', 'audio');

            const candidate = response.candidates?.[0];
            if (candidate?.content?.parts?.[0]?.inlineData?.data) {
                const rawPcmBase64 = candidate.content.parts[0].inlineData.data;
                const wavDataUri = createWavDataUri(rawPcmBase64);

                const binaryString = Buffer.from(rawPcmBase64, 'base64').toString('binary');
                const duration = binaryString.length / 2 / 24000;

                console.log('[Gemini TTS] Generated WAV audio, size:', wavDataUri.length, 'chars', 'Duration:', duration.toFixed(2), 's');

                return { url: wavDataUri, duration };
            }
            throw new Error("Audio generation failed - no inline data");
        }, userId);
    }

    static async generateScript(
        userId: string,
        topic: string,
        style: string,
        language: string,
        durationConfig: { min: number, max: number, targetScenes?: number },
        keys?: { gemini?: string }
    ): Promise<any> {
        const { client: ai, isSystem } = await this.getGeminiClient(userId, keys?.gemini);

        const minSeconds = durationConfig?.min || 65;
        const maxSeconds = durationConfig?.max || 90;
        const sceneInstruction = durationConfig?.targetScenes
            ? `Strictly generate exactly ${durationConfig.targetScenes} scenes.`
            : `Generate between ${Math.max(3, Math.floor(minSeconds / 10))} to ${Math.min(15, Math.ceil(maxSeconds / 5))} scenes based on pacing.`;

        const prompt = `
        You are an expert viral video director for Shorts/Reels.
        Create a script for a vertical short video (9:16) about: "${topic}".
        Style: "${style}". Language: "${language}".
        
        IMPORTANT CONFIGURATION & TIMING REQUIREMENTS:
        1. The TOTAL duration of the video must be STRICTLY between ${minSeconds} and ${maxSeconds} seconds.
        2. ${sceneInstruction}
        3. Ensure the sum of all 'durationSeconds' falls within the ${minSeconds}s - ${maxSeconds}s range. DO NOT produce a video shorter than ${minSeconds} seconds.
        
        CRITICAL INSTRUCTIONS:
        - If the user's input/prompt is short, you MUST EXPAND the narrative.
        - If the user's input/prompt is too long, you MUST SUMMARIZE.
        - Keep the narration natural and engaging.

        VIRAL METADATA STRATEGY (Language: ${language}):
        - "videoTitle": MAX 50 chars. High CTR. Curiosity gap. 1 Emoji. NO hashtags.
        - "videoDescription": 2 lines of engaging text (Hook + CTA) + 5 relevant hashtags including #shorts.

        Output ONLY valid JSON. No markdown.
        USE CAMELCASE FOR ALL KEYS.
        Structure:
        {
            "videoTitle": "Viral Title 🤯",
            "videoDescription": "You won't believe this...\\n#shorts #viral",
            "scenes": [
            { "sceneNumber": 1, "visualDescription": "Detailed visual prompt for AI image generator", "narration": "Voiceover text", "durationSeconds": 5 }
            ]
        }
        `;

        return this.executeRequest(isSystem, async () => {
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: {
                    responseMimeType: "application/json",
                }
            });

            await this.trackUsage(userId, 'gemini', 'gemini-2.5-flash', 'text');

            const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) throw new Error("No script generated");

            try {
                const cleanText = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
                const json = JSON.parse(cleanText);

                const normalizedScenes = (json.scenes || []).map((s: any, i: number) => ({
                    sceneNumber: s.sceneNumber || s.scene_number || (i + 1),
                    visualDescription: s.visualDescription || s.visual_description || "Pending description",
                    narration: s.narration || "Pending narration",
                    durationSeconds: s.durationSeconds || s.duration_seconds || 5
                }));

                return {
                    videoTitle: json.videoTitle || json.title || topic,
                    videoDescription: json.videoDescription || json.description || `Video about ${topic}`,
                    scenes: normalizedScenes
                };
            } catch (e) {
                console.error("JSON Parse Error", text);
                throw new Error("Failed to parse script format.");
            }
        }, userId);
    }

    static async generateMusicPrompt(userId: string, topic: string, style: string, keys?: { gemini?: string }): Promise<string> {
        const { client: ai, isSystem } = await this.getGeminiClient(userId, keys?.gemini);
        const prompt = `Create a text-to-audio prompt for Suno AI. Topic: "${topic}". Style: "${style}". Output: Max 25 words, include "instrumental, no vocals".`;

        return this.executeRequest(isSystem, async () => {
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: [{ role: 'user', parts: [{ text: prompt }] }]
            });

            await this.trackUsage(userId, 'gemini', 'gemini-2.5-flash', 'text');
            return response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "cinematic instrumental background music";
        }, userId);
    }

    static async analyzeCharacterFeatures(userId: string, base64Image: string, keys?: { gemini?: string }): Promise<string> {
        const { client: ai, isSystem } = await this.getGeminiClient(userId, keys?.gemini);
        const base64Data = base64Image.split(',')[1];
        const prompt = `Analyze this character portrait. Describe the FACE in extreme detail for a stable diffusion prompt. Focus on: Skin tone, Eye color/shape, Hair style/color, Facial structure. Ignore clothing/background. Output a comma-separated list of visual adjectives.`;

        return this.executeRequest(isSystem, async () => {
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: [
                    {
                        role: 'user',
                        parts: [
                            { inlineData: { mimeType: "image/png", data: base64Data } },
                            { text: prompt }
                        ]
                    }
                ]
            });

            await this.trackUsage(userId, 'gemini', 'gemini-2.5-flash-vision', 'text');
            return response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "Detailed character face description";
        }, userId);
    }

    static async optimizeReferenceImage(userId: string, base64ImageUrl: string, keys?: { gemini?: string }): Promise<string> {
        const { client: ai, isSystem } = await this.getGeminiClient(userId, keys?.gemini);
        const base64Data = base64ImageUrl.split(',')[1];
        const prompt = `Generate a NEW image of ONLY the character's FACE and HAIR (Headshot). IGNORE original clothing. Solid WHITE background. 1:1 Aspect Ratio.`;

        return this.executeRequest(isSystem, async () => {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: [
                    {
                        role: 'user',
                        parts: [
                            { inlineData: { mimeType: "image/png", data: base64Data } },
                            { text: prompt }
                        ]
                    }
                ],
                config: {
                    imageConfig: { aspectRatio: "1:1" },
                    safetySettings: [
                        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
                        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
                        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
                        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH }
                    ]
                }
            });

            await this.trackUsage(userId, 'gemini', 'gemini-2.5-flash-image', 'image');

            const candidate = response.candidates?.[0];
            if (candidate?.content?.parts) {
                for (const part of candidate.content.parts) {
                    if (part.inlineData?.data) {
                        return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
                    }
                }
            }
            throw new Error("Optimization failed - No image returned");
        }, userId);
    }

    static async getElevenLabsVoices(userId: string, providedKey?: string): Promise<any[]> {
        const { key: apiKey } = await this.getElevenLabsKey(userId, providedKey);
        const ELEVEN_LABS_API_URL = "https://api.elevenlabs.io/v1";

        try {
            const response = await fetch(`${ELEVEN_LABS_API_URL}/voices`, {
                method: 'GET',
                headers: { 'xi-api-key': apiKey }
            });

            if (!response.ok) {
                console.warn(`ElevenLabs API Error: ${response.status} ${response.statusText}`);
                return [];
            }

            const data = await response.json();
            if (!data.voices || !Array.isArray(data.voices)) return [];

            return data.voices.map((v: any) => ({
                name: v.voice_id,
                label: v.name,
                gender: (v.labels?.gender === 'female') ? 'Female' : 'Male',
                description: v.labels?.description || v.category || 'Premium Voice',
                provider: 'elevenlabs',
                previewUrl: v.preview_url,
                labels: v.labels
            }));

        } catch (error) {
            console.error("ElevenLabs Fetch Error", error);
            return [];
        }
    }

    static async generateMusic(userId: string, stylePrompt: string, keys?: { suno?: string }): Promise<string> {
        let apiKey = keys?.suno;
        let isSystem = false;

        if (!apiKey) {
            const dbKeys = await prisma.apiKey.findUnique({ where: { user_id: userId } });
            apiKey = dbKeys?.suno_key || undefined;
        }

        if (!apiKey) {
            apiKey = process.env.SUNO_API_KEY;
            isSystem = true;
        }

        if (!apiKey) throw new Error("Suno API Key missing.");

        const SUNO_BASE_URL = "https://api.sunoapi.org/api/v1";

        const payload = {
            customMode: true,
            instrumental: true,
            style: stylePrompt,
            title: "ShortsAI Soundtrack",
            model: "V3_5",
            callBackUrl: "https://example.com/callback"
        };

        return this.executeRequest(isSystem, async () => {
            const response = await fetch(`${SUNO_BASE_URL}/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error("Suno Request Failed");

            const resJson = await response.json();
            const taskId = resJson.data?.taskId;
            if (!taskId) throw new Error("No taskId returned");

            await this.trackUsage(userId, 'suno', 'V3_5', 'music');

            return await this.pollForMusicCompletion(taskId, apiKey!, SUNO_BASE_URL);
        }, userId);
    }

    private static async pollForMusicCompletion(taskId: string, apiKey: string, baseUrl: string): Promise<string> {
        const maxRetries = 60;
        const interval = 5000;

        for (let i = 0; i < maxRetries; i++) {
            await wait(interval);
            try {
                const res = await fetch(`${baseUrl}/generate/record-info?taskId=${taskId}`, {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${apiKey}` }
                });
                const json = await res.json();
                const recordData = json.data;
                const status = recordData?.status;

                if (status === 'SUCCESS' || status === 'FIRST_SUCCESS') {
                    const clip = recordData.response?.sunoData?.[0];
                    if (clip?.audioUrl) return clip.audioUrl;
                }
                if (['CREATE_TASK_FAILED', 'GENERATE_AUDIO_FAILED'].includes(status)) throw new Error("Music generation failed");
            } catch (e) { console.warn("Polling error", e); }
        }
        throw new Error("Music generation timed out");
    }

    // --- VIDEO RATE LIMITING ---
    private static videoRpmCache = new Map<string, { count: number, resetAt: number }>();
    private static readonly VIDEO_RPM_LIMIT = 2;

    private static async checkVideoRateLimits(userId: string) {
        const now = Date.now();
        const userRpm = this.videoRpmCache.get(userId);

        if (userRpm && now < userRpm.resetAt) {
            if (userRpm.count >= this.VIDEO_RPM_LIMIT) {
                throw new Error("Video generation rate limit exceeded (2 RPM). Please wait a moment.");
            }
            userRpm.count++;
        } else {
            this.videoRpmCache.set(userId, { count: 1, resetAt: now + 60000 });
        }
    }



    // --- VIDEO GENERATION MODELS ---
    static async generateVideo(
        userId: string,
        imageUrl: string,
        prompt: string,
        keys?: { gemini?: string },
        modelType: VeoModelType = 'veo-2' // Default to Veo 2 (higher daily limit)
    ): Promise<string> {
        // Get API key (prefer user key, fallback to system)
        let apiKey = keys?.gemini;
        let isSystem = false;

        if (!apiKey) {
            const dbKeys = await prisma.apiKey.findUnique({ where: { user_id: userId } });
            apiKey = dbKeys?.gemini_key || undefined;
        }

        if (!apiKey) {
            apiKey = process.env.GEMINI_API_KEY;
            isSystem = true;
        }

        if (!apiKey) {
            throw new Error("Gemini API Key missing for video generation.");
        }

        if (isSystem) {
            await this.checkVideoRateLimits(userId);
        }

        const base64Data = imageUrl.split(',')[1];
        const mimeType = imageUrl.match(/data:([^;]+);/)?.[1] || 'image/jpeg';
        const selectedModel = VEO_MODELS[modelType];

        return this.executeRequest(isSystem, async () => {
            console.log(`[AIService] Generating video with ${selectedModel} for user ${userId}`);

            // Use REST API predictLongRunning
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:predictLongRunning`,
                {
                    method: 'POST',
                    headers: {
                        'X-goog-api-key': apiKey!,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        instances: [
                            {
                                prompt: `Animate this image to be a video background. Cinematic, slow motion. ${prompt}`,
                                image: {
                                    bytesBase64Encoded: base64Data,
                                    mimeType: mimeType,
                                },
                            },
                        ],
                        parameters: {
                            aspectRatio: '9:16', // Vertical video for shorts
                            negativePrompt: 'abrupt cuts, discontinuity, inconsistent lighting',
                        },
                    }),
                }
            );

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[AIService] Veo API Error:`, errorText);
                throw new Error(`Veo API request failed: ${response.status} - ${errorText}`);
            }

            const result = await response.json();

            // The API returns an operation that processes async
            const operationName = result.name;

            if (!operationName) {
                throw new Error('No operation name returned from Veo API');
            }

            // Poll for completion
            const videoUrl = await this.pollVeoOperation(operationName, apiKey!);

            // Track usage
            await this.trackUsage(userId, 'gemini', selectedModel, 'video');

            return videoUrl;
        }, userId);
    }

    private static async pollVeoOperation(operationName: string, apiKey: string): Promise<string> {
        const maxRetries = 60; // 5 minutes max (5 seconds * 60)
        const interval = 5000; // 5 seconds

        for (let i = 0; i < maxRetries; i++) {
            await wait(interval);

            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/${operationName}`,
                {
                    headers: {
                        'X-goog-api-key': apiKey,
                    },
                }
            );

            if (!response.ok) {
                console.warn(`[AIService] Poll attempt ${i + 1} failed`);
                continue;
            }

            const operation = await response.json();

            if (operation.done) {
                // Check for error
                if (operation.error) {
                    throw new Error(`Video generation failed: ${operation.error.message}`);
                }

                // Extract video URI from response
                const videoUri = operation.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;

                if (!videoUri) {
                    console.error('[AIService] No video URI in response:', JSON.stringify(operation.response));
                    throw new Error('No video URL in completed operation');
                }

                // Download the video and convert to base64
                console.log(`[AIService] Downloading video from ${videoUri}`);
                const videoResponse = await fetch(videoUri, {
                    headers: {
                        'X-goog-api-key': apiKey,
                    },
                });

                if (!videoResponse.ok) {
                    throw new Error(`Failed to download video: ${videoResponse.status}`);
                }

                const videoBuffer = await videoResponse.arrayBuffer();
                const base64Video = Buffer.from(videoBuffer).toString('base64');

                return `data:video/mp4;base64,${base64Video}`;
            }
        }

        throw new Error('Video generation timed out after 5 minutes');
    }
}
