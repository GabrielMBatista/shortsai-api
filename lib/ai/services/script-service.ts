import { KeyManager } from '../core/key-manager';
import { executeRequest } from '../core/executor';
import { trackUsage } from '../core/usage-tracker';

import { generateVideoScriptPrompt } from '../prompts/script-prompts';

export class ScriptService {
    static async generateScript(
        userId: string,
        topic: string,
        style: string,
        language: string,
        durationConfig: { min: number, max: number, targetScenes?: number },
        keys?: { gemini?: string }
    ): Promise<any> {
        const { client: ai, isSystem } = await KeyManager.getGeminiClient(userId, keys?.gemini);

        const minSeconds = durationConfig?.min ?? 65;
        const maxSeconds = durationConfig?.max ?? 90;
        const sceneInstruction = durationConfig?.targetScenes
            ? `Strictly generate exactly ${durationConfig.targetScenes} scenes.`
            : `Generate between ${Math.max(3, Math.floor(minSeconds / 10))} to ${Math.min(15, Math.ceil(maxSeconds / 5))} scenes based on pacing.`;

        const prompt = generateVideoScriptPrompt(topic, style, language, minSeconds, maxSeconds, sceneInstruction);

        return executeRequest(isSystem, async () => {
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: {
                    responseMimeType: "application/json",
                }
            });

            await trackUsage(userId, 'gemini', 'gemini-2.5-flash', 'text');

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
}
