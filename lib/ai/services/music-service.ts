import { KeyManager } from '../core/key-manager';
import { executeRequest } from '../core/executor';
import { trackUsage } from '../core/usage-tracker';
import { wait } from '../core/queue';

export class MusicService {
    static async generateMusicPrompt(userId: string, topic: string, style: string, keys?: { gemini?: string }): Promise<string> {
        const { client: ai, isSystem } = await KeyManager.getGeminiClient(userId, keys?.gemini);
        const prompt = `Create a text-to-audio prompt for Suno AI. Topic: "${topic}". Style: "${style}". Output: Max 25 words, include "instrumental, no vocals".`;

        return executeRequest(isSystem, async () => {
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: [{ role: 'user', parts: [{ text: prompt }] }]
            });

            await trackUsage(userId, 'gemini', 'gemini-2.5-flash', 'text');
            return response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "cinematic instrumental background music";
        }, userId);
    }

    static async generateMusic(userId: string, stylePrompt: string, keys?: { suno?: string }): Promise<string> {
        const { key: apiKey, isSystem } = await KeyManager.getSunoKey(userId, keys?.suno);

        const SUNO_BASE_URL = "https://api.sunoapi.org/api/v1";

        const payload = {
            customMode: true,
            instrumental: true,
            style: stylePrompt,
            title: "ShortsAI Soundtrack",
            model: "V3_5",
            callBackUrl: "https://example.com/callback"
        };

        return executeRequest(isSystem, async () => {
            const response = await fetch(`${SUNO_BASE_URL}/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error("Suno Request Failed");

            const resJson = await response.json();
            const taskId = resJson.data?.taskId;
            if (!taskId) throw new Error("No taskId returned");

            await trackUsage(userId, 'suno', 'V3_5', 'music');

            return await this.pollForMusicCompletion(taskId, apiKey, SUNO_BASE_URL);
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
}
