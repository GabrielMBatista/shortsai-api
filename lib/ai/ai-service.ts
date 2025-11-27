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

    private static async getGeminiClient(userId: string) {
        const keys = await prisma.apiKey.findUnique({ where: { user_id: userId } });
        const apiKey = keys?.gemini_key || process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("Gemini API Key missing");
        return new GoogleGenAI({ apiKey });
    }

    private static async getElevenLabsKey(userId: string) {
        const keys = await prisma.apiKey.findUnique({ where: { user_id: userId } });
        const apiKey = keys?.elevenlabs_key || process.env.ELEVENLABS_API_KEY;
        if (!apiKey) throw new Error("ElevenLabs API Key missing");
        return apiKey;
    }

    private static async trackUsage(userId: string, provider: string, model: string, type: 'image' | 'audio') {
        // TODO: Implement DB logging
        console.log(`[Usage] User ${userId} used ${provider}/${model} for ${type}`);
        // await prisma.usageLog.create(...)
    }

    static async generateImage(userId: string, prompt: string, style: string): Promise<string> {
        const ai = await this.getGeminiClient(userId);

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

    static async generateAudio(userId: string, text: string, voice: string, provider: string): Promise<string> {
        if (provider === 'elevenlabs') {
            return this.generateElevenLabsAudio(userId, text, voice);
        } else {
            return this.generateGeminiAudio(userId, text, voice);
        }
    }

    private static async generateElevenLabsAudio(userId: string, text: string, voiceId: string): Promise<string> {
        const apiKey = await this.getElevenLabsKey(userId);
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

    private static async generateGeminiAudio(userId: string, text: string, voiceName: string): Promise<string> {
        const ai = await this.getGeminiClient(userId);

        return generationQueue.add(() => retryWithBackoff(async () => {
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash-preview-tts",
                contents: [{ role: 'user', parts: [{ text: text }] }],
                config: {
                    responseMimeType: 'audio/x-wav', // Request WAV directly
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName || 'Kore' } } },
                },
            });

            await this.trackUsage(userId, 'gemini', 'gemini-2.5-flash-preview-tts', 'audio');

            const candidate = response.candidates?.[0];
            if (candidate?.content?.parts?.[0]?.inlineData?.data) {
                // Gemini TTS returns base64 encoded WAV data directly
                return `data:audio/wav;base64,${candidate.content.parts[0].inlineData.data}`;
            }
            throw new Error("Audio generation failed");
        }));
    }
}
