import { prisma } from '@/lib/prisma';
import { GoogleGenAI, HarmCategory, HarmBlockThreshold, Modality } from "@google/genai";

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

    return `data: audio / wav; base64, ${uint8ArrayToBase64(wavBytes)} `;
};

const blobToBase64 = async (blob: Blob): Promise<string> => {
    // In Node environment, we use Buffer.
    return Buffer.from(await blob.arrayBuffer()).toString('base64');
};


export class AIService {

    private static async getGeminiClient(userId: string, providedKey?: string) {
        if (providedKey) return new GoogleGenAI({ apiKey: providedKey });

        const keys = await prisma.apiKey.findUnique({ where: { user_id: userId } });
        const apiKey = keys?.gemini_key || process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("Gemini API Key missing");
        return new GoogleGenAI({ apiKey });
    }

    private static async getElevenLabsKey(userId: string, providedKey?: string) {
        if (providedKey) return providedKey;

        const keys = await prisma.apiKey.findUnique({ where: { user_id: userId } });
        const apiKey = keys?.elevenlabs_key || process.env.ELEVENLABS_API_KEY;
        if (!apiKey) throw new Error("ElevenLabs API Key missing");
        return apiKey;
    }

    private static async trackUsage(userId: string, provider: string, model: string, type: 'image' | 'audio' | 'text') {
        // TODO: Implement DB logging
        console.log(`[Usage] User ${userId} used ${provider}/${model} for ${type}`);
        // await prisma.usageLog.create(...)
    }

    static async generateImage(userId: string, prompt: string, style: string, keys?: { gemini?: string }): Promise<string> {
        const ai = await this.getGeminiClient(userId, keys?.gemini);

        const fullPrompt = `Create a vertical (9:16) image in the style of ${style}. Scene: ${prompt}.`;

        return generationQueue.add(() => retryWithBackoff(async () => {
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
        }));
    }

    static async generateAudio(userId: string, text: string, voice: string, provider: string, keys?: { gemini?: string, elevenlabs?: string }): Promise<string> {
        if (provider === 'elevenlabs') {
            return this.generateElevenLabsAudio(userId, text, voice, keys?.elevenlabs);
        } else {
            return this.generateGeminiAudio(userId, text, voice, keys?.gemini);
        }
    }

    private static async generateElevenLabsAudio(userId: string, text: string, voiceId: string, providedKey?: string): Promise<string> {
        const apiKey = await this.getElevenLabsKey(userId, providedKey);
        const ELEVEN_LABS_API_URL = "https://api.elevenlabs.io/v1";

        // Default to multilingual v2 for better language support
        const modelId = "eleven_multilingual_v2";

        return generationQueue.add(() => retryWithBackoff(async () => {
            const response = await fetch(`${ELEVEN_LABS_API_URL}/text-to-speech/${voiceId}`, {
                method: 'POST',
                headers: {
                    'Accept': 'audio/mpeg',
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

            const blob = await response.blob();
            // Convert to Base64 Data URI
            const base64Audio = await blobToBase64(blob);
            // ElevenLabs returns MP3, so prefix correctly
            return `data:audio/mpeg;base64,${base64Audio}`;
        }));
    }

    // Helper: Create proper WAV file from raw PCM data
    private static createWavFromPcm(base64Pcm: string): string {
        // Decode base64 to binary
        const binaryString = Buffer.from(base64Pcm, 'base64').toString('binary');
        const pcmBytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            pcmBytes[i] = binaryString.charCodeAt(i);
        }

        const len = pcmBytes.length;

        // Create WAV header (44 bytes)
        const wavHeader = Buffer.alloc(44);

        // "RIFF" chunk descriptor
        wavHeader.write('RIFF', 0);
        wavHeader.writeUInt32LE(36 + len, 4); // File size - 8
        wavHeader.write('WAVE', 8);

        // "fmt " sub-chunk
        wavHeader.write('fmt ', 12);
        wavHeader.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
        wavHeader.writeUInt16LE(1, 20); // AudioFormat (1 = PCM)
        wavHeader.writeUInt16LE(1, 22); // NumChannels (1 = Mono)
        wavHeader.writeUInt32LE(24000, 24); // SampleRate (24kHz)
        wavHeader.writeUInt32LE(24000 * 2, 28); // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
        wavHeader.writeUInt16LE(2, 32); // BlockAlign (NumChannels * BitsPerSample/8)
        wavHeader.writeUInt16LE(16, 34); // BitsPerSample (16-bit)

        // "data" sub-chunk
        wavHeader.write('data', 36);
        wavHeader.writeUInt32LE(len, 40); // Subchunk2Size (PCM data size)

        // Concatenate header and PCM data
        const wavBytes = Buffer.concat([wavHeader, Buffer.from(pcmBytes)]);

        return `data:audio/wav;base64,${wavBytes.toString('base64')}`;
    }

    private static async generateGeminiAudio(userId: string, text: string, voiceName: string, providedKey?: string): Promise<string> {
        const ai = await this.getGeminiClient(userId, providedKey);

        return generationQueue.add(() => retryWithBackoff(async () => {
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

                // Gemini TTS returns raw PCM data - we need to wrap it in a WAV file structure
                const wavDataUri = this.createWavFromPcm(rawPcmBase64);

                console.log('[Gemini TTS] Generated WAV audio, size:', wavDataUri.length, 'chars');

                return wavDataUri;
            }
            throw new Error("Audio generation failed - no inline data");
        }));
    }

    static async generateScript(
        userId: string,
        topic: string,
        style: string,
        language: string,
        durationConfig: { min: number, max: number, targetScenes?: number },
        keys?: { gemini?: string }
    ): Promise<any> {
        const ai = await this.getGeminiClient(userId, keys?.gemini);

        // Safe defaults
        const minSeconds = durationConfig?.min || 55;
        const maxSeconds = durationConfig?.max || 65;
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
        3. Ensure the sum of all 'durationSeconds' falls within the ${minSeconds}s - ${maxSeconds}s range.
        
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

        return generationQueue.add(() => retryWithBackoff(async () => {
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
                // Clean markdown if present
                const cleanText = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
                const json = JSON.parse(cleanText);

                // Normalize keys to camelCase (Standardization)
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
        }));
    }

    static async generateMusicPrompt(userId: string, topic: string, style: string, keys?: { gemini?: string }): Promise<string> {
        const ai = await this.getGeminiClient(userId, keys?.gemini);
        const prompt = `Create a text-to-audio prompt for Suno AI. Topic: "${topic}". Style: "${style}". Output: Max 25 words, include "instrumental, no vocals".`;

        return generationQueue.add(() => retryWithBackoff(async () => {
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: [{ role: 'user', parts: [{ text: prompt }] }]
            });

            await this.trackUsage(userId, 'gemini', 'gemini-2.5-flash', 'text');
            return response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "cinematic instrumental background music";
        }));
    }

    static async analyzeCharacterFeatures(userId: string, base64Image: string, keys?: { gemini?: string }): Promise<string> {
        const ai = await this.getGeminiClient(userId, keys?.gemini);
        const base64Data = base64Image.split(',')[1];
        const prompt = `Analyze this character portrait. Describe the FACE in extreme detail for a stable diffusion prompt. Focus on: Skin tone, Eye color/shape, Hair style/color, Facial structure. Ignore clothing/background. Output a comma-separated list of visual adjectives.`;

        return generationQueue.add(() => retryWithBackoff(async () => {
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
        }));
    }

    static async optimizeReferenceImage(userId: string, base64ImageUrl: string, keys?: { gemini?: string }): Promise<string> {
        const ai = await this.getGeminiClient(userId, keys?.gemini);
        const base64Data = base64ImageUrl.split(',')[1];
        const prompt = `Generate a NEW image of ONLY the character's FACE and HAIR (Headshot). IGNORE original clothing. Solid WHITE background. 1:1 Aspect Ratio.`;

        return generationQueue.add(() => retryWithBackoff(async () => {
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
        }));
    }
    static async getElevenLabsVoices(userId: string, providedKey?: string): Promise<any[]> {
        const apiKey = await this.getElevenLabsKey(userId, providedKey);
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
        // Fetch Suno Key
        let apiKey = keys?.suno;
        if (!apiKey) {
            const dbKeys = await prisma.apiKey.findUnique({ where: { user_id: userId } });
            apiKey = dbKeys?.suno_key || process.env.SUNO_API_KEY;
        }

        if (!apiKey) throw new Error("Suno API Key missing.");

        const SUNO_BASE_URL = "https://api.sunoapi.org/api/v1";

        const payload = {
            customMode: true,
            instrumental: true,
            style: stylePrompt,
            title: "ShortsAI Soundtrack",
            model: "V3_5",
            callBackUrl: "https://example.com/callback" // Optional
        };

        // Start Generation
        const response = await fetch(`${SUNO_BASE_URL}/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error("Suno Request Failed");

        const resJson = await response.json();
        const taskId = resJson.data?.taskId;
        if (!taskId) throw new Error("No taskId returned");

        await this.trackUsage(userId, 'suno', 'V3_5', 'audio'); // Using 'audio' for music

        // Poll for completion
        return await this.pollForMusicCompletion(taskId, apiKey, SUNO_BASE_URL);
    }

    private static async pollForMusicCompletion(taskId: string, apiKey: string, baseUrl: string): Promise<string> {
        const maxRetries = 60; // 5 minutes
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
}
