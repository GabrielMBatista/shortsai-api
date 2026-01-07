import { KeyManager } from '../core/key-manager';
import { executeRequest } from '../core/executor';
import { trackUsage } from '../core/usage-tracker';
import { generateVideoScriptPrompt } from '../prompts/script-prompts';
import { normalizeScriptFormat } from '../core/json-normalizer';
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
            const { ChannelService } = await import('../../../lib/channels/channel-service');

            const [recentProjects, youtubeVideos] = await Promise.all([
                // Projetos criados na plataforma para ESTE canal
                prisma.project.findMany({
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
                }),

                // 🆕 Vídeos do YouTube (para contexto real do canal)
                ChannelService.getChannelVideos(options.channelId, {
                    maxResults: 20
                }).catch(err => {
                    console.warn('[ScriptService] Failed to fetch YouTube videos:', err.message);
                    return [];
                })
            ]);

            // Construir contexto combinado (projetos + vídeos)
            const allContent: { title: string; source: string; performance?: number }[] = [];

            // Adicionar projetos da plataforma
            recentProjects.forEach(p => {
                allContent.push({
                    title: p.generated_title || p.topic,
                    source: 'platform'
                });
            });

            // Adicionar vídeos do YouTube (ordenados por views)
            youtubeVideos
                .sort((a: any, b: any) => b.statistics.viewCount - a.statistics.viewCount)
                .slice(0, 15) // Top 15 vídeos
                .forEach((v: any) => {
                    allContent.push({
                        title: v.title,
                        source: 'youtube',
                        performance: v.statistics.viewCount
                    });
                });

            if (allContent.length > 0) {
                // Formatar números grandes
                const formatViews = (views: number): string => {
                    if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M`;
                    if (views >= 1_000) return `${(views / 1_000).toFixed(1)}K`;
                    return views.toString();
                };

                antiRepetitionContext = `
═══════════════════════════════════════
CONTEXTO ANTI-REPETIÇÃO & PERFORMANCE:
═══════════════════════════════════════

📊 HISTÓRICO DO CANAL (${allContent.length} vídeos analisados):

${allContent.slice(0, 20).map((item, i) => {
                    const perfLabel = item.performance
                        ? ` [${item.performance >= 10000 ? '🔥 ' : ''}${formatViews(item.performance)} views]`
                        : '';
                    const sourceLabel = item.source === 'youtube' ? '(YouTube)' : '(Platform)';
                    return `${i + 1}. ${item.title}${perfLabel} ${sourceLabel}`;
                }).join('\n')}

${youtubeVideos.length > 0 ? `
🎯 INSIGHTS DE PERFORMANCE:
- Total de vídeos no canal: ${youtubeVideos.length}
- Vídeos com ${formatViews(10000)}+ views: ${youtubeVideos.filter((v: any) => v.statistics.viewCount >= 10000).length}
` : ''}

⚠️ IMPORTANTE: 
1. Evite repetir temas já cobertos, especialmente os bem-sucedidos (alto views)
2. Busque novos ângulos ou abordagens diferentes
3. Mantenha a voz e estilo do canal, mas traga frescor ao conteúdo
═══════════════════════════════════════
`;
            }
        }

        // 3. Construir prompt base
        const basePrompt = generateVideoScriptPrompt(topic, style, language, minSeconds, maxSeconds, sceneInstruction);

        // 3.5. Reforçar descrições visuais da persona se aplicável
        let personaVisualReinforcement = '';
        if (persona && persona.systemInstruction) {
            // Extrair seções visuais da systemInstruction para reforço explícito
            const instruction = persona.systemInstruction;

            // Detectar se há descrições de personagens (ex: JESUS, character, visual)
            const hasCharacterDescriptions =
                instruction.includes('JESUS:') ||
                instruction.includes('character:') ||
                instruction.includes('modelo_visual_constante');

            // Detectar se há banco de cenários
            const hasSceneBank =
                instruction.includes('banco_de_cenarios') ||
                instruction.includes('CENÁRIOS') ||
                instruction.includes('SCENARIOS');

            // Detectar se há estilo visual específico
            const hasVisualStyle =
                instruction.includes('ESTILO VISUAL') ||
                instruction.includes('visualStyle') ||
                instruction.includes('RESTRIÇÕES TÉCNICAS');

            if (hasCharacterDescriptions || hasSceneBank || hasVisualStyle) {
                personaVisualReinforcement = `
═══════════════════════════════════════
⚠️ INSTRUÇÕES VISUAIS DA PERSONA (MANDATORY)
═══════════════════════════════════════
VOCÊ ESTÁ USANDO A PERSONA: "${persona.name}"

🎨 REGRAS VISUAIS OBRIGATÓRIAS:
- Todas as descrições visuais (visualDescription) DEVEM seguir RIGOROSAMENTE as instruções da persona
- Se a persona define aparência de personagens (ex: JESUS), USE EXATAMENTE essa descrição em TODA aparição
- Se a persona define banco de cenários específicos, USE APENAS esses cenários listados
- Se a persona define restrições técnicas (ex: sem texto, sem metáforas abstratas), RESPEITE totalmente
- Mantenha CONSISTÊNCIA VISUAL absoluta entre todas as cenas

⚠️ CRITICAL: As instruções visuais da sua system instruction têm PRIORIDADE MÁXIMA sobre qualquer outra diretriz genérica.
═══════════════════════════════════════
`;
            }
        }

        // 4. Prompt final (com todos os contextos aplicáveis)
        const promptParts = [
            antiRepetitionContext,
            personaVisualReinforcement,
            basePrompt
        ].filter(part => part.trim().length > 0);

        const finalPrompt = promptParts.join('\n\n');

        // 5. Gerar script
        const startTime = Date.now();
        let success = false;
        let error: any = null;

        try {
            const result = await executeRequest(isSystem, async () => {
                const response = await ai.models.generateContent({
                    model: "gemini-2.5-flash",
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

                    // 🔥 Usar normalização flexível - aceita QUALQUER formato de persona
                    console.log('[ScriptService] Normalizing JSON format automatically...');
                    const normalized = normalizeScriptFormat(json, topic);

                    console.log(`[ScriptService] ✅ Normalized successfully: ${normalized.scenes.length} scenes`);
                    console.log(`[ScriptService] Metadados: ${normalized.videoTitle} | ${normalized.videoDescription?.substring(0, 50)}...`);

                    // 🎯 GERAÇÃO AUTOMÁTICA DE METADADOS SE NECESSÁRIO
                    const needsMetadataGeneration =
                        !normalized.videoTitle ||
                        normalized.videoTitle.trim() === "" ||
                        normalized.videoTitle === "Untitled" ||
                        !normalized.videoDescription ||
                        normalized.videoDescription.trim() === "";

                    let finalVideoTitle = normalized.videoTitle;
                    let finalVideoDescription = normalized.videoDescription;
                    let finalShortsHashtags = normalized.shortsHashtags;
                    let finalTiktokText = normalized.tiktokText;
                    let finalTiktokHashtags = normalized.tiktokHashtags;

                    if (needsMetadataGeneration) {
                        console.log('[ScriptService] ⚡ Metadados ausentes, gerando automaticamente...');

                        try {
                            const { MetadataService } = await import('./metadata-service');

                            // Construir conteúdo do vídeo para análise
                            const videoContent = normalized.scenes
                                .map((s: any) => s.narration)
                                .join(' ')
                                .substring(0, 1000); // Limitar para não exceder tokens

                            // Gerar metadados otimizados
                            const generatedMetadata = await MetadataService.generateOptimizedMetadata(
                                userId,
                                topic, // Usa o prompt original como base
                                videoContent,
                                options?.channelId,
                                language
                            );

                            // Usar metadados gerados
                            finalVideoTitle = generatedMetadata.optimizedTitle;
                            finalVideoDescription = generatedMetadata.optimizedDescription;
                            finalShortsHashtags = generatedMetadata.shortsHashtags;
                            finalTiktokText = generatedMetadata.tiktokText;
                            finalTiktokHashtags = generatedMetadata.tiktokHashtags;

                            console.log(`[ScriptService] ✅ Metadados gerados automaticamente:`);
                            console.log(`   Título: "${finalVideoTitle}"`);
                            console.log(`   Hashtags: ${finalShortsHashtags.join(', ')}`);
                        } catch (metadataError) {
                            console.error('[ScriptService] ⚠️ Falha ao gerar metadados automaticamente:', metadataError);

                            // Fallback final se geração automática falhar
                            finalVideoTitle = normalized.videoTitle || topic;
                            finalVideoDescription = normalized.videoDescription || `Vídeo sobre: ${topic}`;
                            finalShortsHashtags = normalized.shortsHashtags?.length > 0
                                ? normalized.shortsHashtags
                                : ['#shorts', '#viral'];
                            finalTiktokHashtags = normalized.tiktokHashtags?.length > 0
                                ? normalized.tiktokHashtags
                                : ['#fyp', '#viral'];

                            console.log('[ScriptService] ℹ️ Usando fallback simples');
                        }
                    } else {
                        console.log('[ScriptService] ✅ Metadados da persona estão completos');
                    }

                    // 🛡️ GARANTIA FINAL DE METADADOS VÁLIDOS
                    // Fallback to topic if title is missing or generic "Untitled"
                    const safeVideoTitle = (finalVideoTitle && finalVideoTitle.trim() !== "" && finalVideoTitle !== "Untitled")
                        ? finalVideoTitle
                        : topic;

                    const safeVideoDescription = finalVideoDescription && finalVideoDescription.trim() !== ""
                        ? finalVideoDescription
                        : `Vídeo sobre: ${topic}`;

                    const safeShortsHashtags = Array.isArray(finalShortsHashtags) && finalShortsHashtags.length > 0
                        ? finalShortsHashtags
                        : ['#shorts', '#viral'];

                    const safeTiktokHashtags = Array.isArray(finalTiktokHashtags) && finalTiktokHashtags.length > 0
                        ? finalTiktokHashtags
                        : ['#fyp', '#viral'];

                    return {
                        videoTitle: safeVideoTitle,
                        videoDescription: safeVideoDescription,
                        shortsHashtags: safeShortsHashtags,
                        tiktokText: finalTiktokText || "",
                        tiktokHashtags: safeTiktokHashtags,
                        scenes: normalized.scenes,
                        metadata: normalized.metadata // Preservar metadados originais
                    };
                } catch (e) {
                    console.error("[ScriptService] JSON Parse Error:", text);
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
