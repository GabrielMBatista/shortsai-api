import { KeyManager } from '../core/key-manager';
import { executeRequest } from '../core/executor';
import { trackUsage } from '../core/usage-tracker';
import { generateVideoScriptPrompt } from '../prompts/script-prompts';
import { prisma } from '@/lib/prisma';

export class ScriptService {
    static async generateScript(
        userId: string,
        topic: string,
        style: string,
        language: string,
        durationConfig: { min: number, max: number, targetScenes?: number },
        keys?: { gemini?: string },
        options?: {
            personaId?: string;
            channelId?: string;
        }
    ): Promise<any> {
        const { client: ai, isSystem } = await KeyManager.getGeminiClient(userId, keys?.gemini);

        const minSeconds = durationConfig?.min ?? 65;
        const maxSeconds = durationConfig?.max ?? 90;
        const sceneInstruction = durationConfig?.targetScenes
            ? `Strictly generate exactly ${durationConfig.targetScenes} scenes.`
            : `Generate between ${Math.max(3, Math.floor(minSeconds / 10))} to ${Math.min(15, Math.ceil(maxSeconds / 5))} scenes based on pacing.`;

        // 1. Buscar persona se fornecida
        let persona = null;
        let systemInstruction: string | undefined;
        let generationConfig: any = {};

        if (options?.personaId) {
            persona = await prisma.persona.findUnique({
                where: { id: options.personaId }
            });

            if (persona) {
                systemInstruction = persona.systemInstruction;
                generationConfig = {
                    temperature: persona.temperature,
                    topP: persona.topP,
                    topK: persona.topK,
                    maxOutputTokens: persona.maxOutputTokens
                };
            }
        }

        // 2. Buscar contexto anti-repetição (se canal fornecido)
        let antiRepetitionContext = '';
        if (options?.channelId) {
            const recentProjects = await prisma.project.findMany({
                where: {
                    channel_id: options.channelId,
                    status: 'completed'
                },
                orderBy: { created_at: 'desc' },
                take: 5,
                select: {
                    generated_title: true,
                    topic: true,
                    scenes: {
                        select: {
                            visual_description: true,
                            narration: true
                        },
                        take: 3 // Primeiras 3 cenas de cada
                    }
                }
            });

            if (recentProjects.length > 0) {
                const recentTopics = recentProjects.map(p => p.generated_title || p.topic).filter(Boolean);

                antiRepetitionContext = `
═══════════════════════════════════════
CONTEXTO ANTI-REPETIÇÃO:
═══════════════════════════════════════
Os últimos ${recentProjects.length} vídeos deste canal abordaram:
${recentTopics.map((t, i) => `${i + 1}. ${t}`).join('\n')}

⚠️ IMPORTANTE: Evite repetir temas, abordagens e estruturas narrativas similares.
Traga novidade e frescor ao conteúdo.
═══════════════════════════════════════
`;
            }
        }

        // 3. Construir prompt base
        const basePrompt = generateVideoScriptPrompt(topic, style, language, minSeconds, maxSeconds, sceneInstruction);

        // 4. Prompt final (com contexto se aplicável)
        const finalPrompt = antiRepetitionContext
            ? `${antiRepetitionContext}\n\n${basePrompt}`
            : basePrompt;

        // 5. Gerar script
        const startTime = Date.now();
        let success = false;
        let error: any = null;

        try {
            const result = await executeRequest(isSystem, async () => {
                const response = await ai.models.generateContent({
                    model: "gemini-2.0-flash-exp",
                    contents: [{ role: 'user', parts: [{ text: finalPrompt }] }],
                    config: {
                        systemInstruction: systemInstruction || undefined,
                        responseMimeType: "application/json",
                        ...generationConfig
                    }
                });

                await trackUsage(userId, 'gemini', 'gemini-2.0-flash-exp', 'text');

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
                        shortsHashtags: json.shortsHashtags || [],
                        tiktokText: json.tiktokText || "",
                        tiktokHashtags: json.tiktokHashtags || [],
                        scenes: normalizedScenes
                    };
                } catch (e) {
                    console.error("JSON Parse Error", text);
                    throw new Error("Failed to parse script format.");
                }
            }, userId);

            success = true;
            return result;

        } catch (e) {
            error = e;
            throw e;
        } finally {
            // 6. Track uso da persona (se aplicável)
            if (persona) {
                const duration = Date.now() - startTime;

                try {
                    await prisma.personaUsageLog.create({
                        data: {
                            personaId: persona.id,
                            userId,
                            projectId: null, // Será atualizado quando project for criado
                            action: 'script_generation',
                            success,
                            duration,
                            errorMsg: error?.message,
                            metadata: {
                                topic,
                                language,
                                channelId: options?.channelId
                            }
                        }
                    });

                    // Incrementar contador
                    await prisma.persona.update({
                        where: { id: persona.id },
                        data: {
                            usageCount: { increment: 1 },
                            lastUsedAt: new Date()
                        }
                    });
                } catch (trackError) {
                    console.error('[ScriptService] Failed to track persona usage:', trackError);
                    // Não falhar a geração por erro de tracking
                }
            }
        }
    }
}
