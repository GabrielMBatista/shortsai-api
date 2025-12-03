import { KeyManager } from '../core/key-manager';
import { executeRequest } from '../core/executor';
import { trackUsage } from '../core/usage-tracker';
import { createWavDataUri } from '../utils/audio-helpers';

export class AudioService {
    static async generateAudio(userId: string, text: string, voice: string, provider: string, keys?: { gemini?: string, elevenlabs?: string, groq?: string }, modelId?: string): Promise<{ url: string, timings?: any[], duration?: number }> {
        if (provider === 'elevenlabs') {
            return this.generateElevenLabsAudio(userId, text, voice, keys?.elevenlabs, modelId);
        } else if (provider === 'groq') {
            return this.generateGroqAudio(userId, text, voice, keys?.groq);
        } else {
            return this.generateGeminiAudio(userId, text, voice, keys?.gemini);
        }
    }

    private static async generateGroqAudio(userId: string, text: string, voiceName: string, providedKey?: string): Promise<{ url: string, timings?: any[], duration?: number }> {
        const { key: apiKey, isSystem } = await KeyManager.getGroqKey(userId, providedKey);
        const GROQ_API_URL = "https://api.groq.com/openai/v1/audio/speech";

        return executeRequest(isSystem, async () => {
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

            await trackUsage(userId, 'groq', 'playai-tts', 'audio', duration);

            return { url, duration };
        }, userId);
    }

    private static async generateElevenLabsAudio(userId: string, text: string, voiceId: string, providedKey?: string, modelId: string = "eleven_flash_v2_5"): Promise<{ url: string, timings?: any[], duration?: number }> {
        const { key: apiKey, isSystem } = await KeyManager.getElevenLabsKey(userId, providedKey);
        const ELEVEN_LABS_API_URL = "https://api.elevenlabs.io/v1";

        return executeRequest(isSystem, async () => {
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

            // Fallback: Estimate from file size (assuming ~128kbps for ElevenLabs MP3)
            if (!duration && base64Audio) {
                const bufferLength = Buffer.from(base64Audio, 'base64').length;
                // 128kbps = 16000 bytes/sec
                duration = bufferLength / 16000;
            }

            await trackUsage(userId, 'elevenlabs', modelId, 'audio', duration);

            return { url, timings, duration };
        }, userId);
    }

    private static async generateGeminiAudio(userId: string, text: string, voiceName: string, providedKey?: string): Promise<{ url: string, timings?: any[], duration?: number }> {
        const { client: ai, isSystem } = await KeyManager.getGeminiClient(userId, providedKey);

        return executeRequest(isSystem, async () => {
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash-preview-tts",
                contents: [{ role: 'user', parts: [{ text: text }] }],
                config: {
                    responseModalities: ["AUDIO"] as any,
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName || 'Kore' } } },
                },
            });

            const candidate = response.candidates?.[0];
            if (candidate?.content?.parts?.[0]?.inlineData?.data) {
                const rawPcmBase64 = candidate.content.parts[0].inlineData.data;
                const wavDataUri = createWavDataUri(rawPcmBase64);

                const binaryString = Buffer.from(rawPcmBase64, 'base64').toString('binary');
                const duration = binaryString.length / 2 / 24000;

                console.log('[Gemini TTS] Generated WAV audio, size:', wavDataUri.length, 'chars', 'Duration:', duration.toFixed(2), 's');

                await trackUsage(userId, 'gemini', 'gemini-2.5-flash-preview-tts', 'audio', duration);

                return { url: wavDataUri, duration };
            }
            throw new Error("Audio generation failed - no inline data");
        }, userId);
    }

    static async getElevenLabsVoices(userId: string, providedKey?: string): Promise<any[]> {
        const { key: apiKey } = await KeyManager.getElevenLabsKey(userId, providedKey);
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
}
