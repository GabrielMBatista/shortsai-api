import { prisma } from '@/lib/prisma';
import { KeyManager } from '../core/key-manager';
import { executeRequest } from '../core/executor';
import { trackUsage } from '../core/usage-tracker';
import { WeeklyScheduler } from './weekly-scheduler';

export class ChatService {
    /**
     * Sends a message to a Persona and gets a response
     */
    static async chatWithPersona(
        userId: string,
        personaId: string,
        message: string,
        history: { role: 'user' | 'model', parts: { text: string }[] }[] = [],
        channelId?: string
    ) {
        // 1. Fetch Channel Context (Pre-fetch for both flows)
        let channelContext = '';
        if (channelId) {
            try {
                const { ChannelService } = await import('../../../lib/channels/channel-service');
                const [recentProjects, youtubeVideos] = await Promise.all([
                    prisma.project.findMany({
                        where: { channel_id: channelId, status: 'completed' },
                        orderBy: { created_at: 'desc' },
                        take: 5,
                        select: { topic: true, generated_title: true }
                    }),
                    // Fetch RECENT videos (default sort) to analyze current performance trends (both high and low)
                    // Increased to 50 to get a better statistical sample as requested
                    ChannelService.getChannelVideos(channelId, { maxResults: 50, orderBy: 'date' })
                ]);

                const formatNum = (num: number) => {
                    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
                    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
                    return num.toString();
                };

                // Optimized format for maximum density: "Title (V:10k)"
                // We send ALL 50 videos to allow the AI to find subtle patterns, but we strip unnecessary chars.
                const videoList = youtubeVideos.map(v =>
                    `${v.title.substring(0, 50)} (V:${formatNum(v.statistics.viewCount)})`
                ).join(' | ');

                channelContext = `
═══════════════════════════════════════
CHANNEL PERFORMANCE (Last 50 Videos)
═══════════════════════════════════════
Format: Title (V: Views). Ordered by date (Newest first).
Use this full dataset to identify detailed trends, saturation points, and rising topics.

DATA:
${videoList}

Stats Legend: V=Views, K=Thousands, M=Millions.

📅 RECENT PROJECTS (Avoid Repetition):
${recentProjects.map(p => `- ${p.generated_title || p.topic}`).join('\n') || "None recent."}

STRATEGIC INSTRUCTIONS:
1. Scan the full list of 50 videos to detect the channel's current pulse.
2. Identify topics that are becoming saturated (many recent videos with declining views).
3. Identify outlier hits in the sea of average content.
4. APPLY these full-history insights to maximize the virality of the new JSON output.
5. Output valid JSON only.
═══════════════════════════════════════
`;
            } catch (err) {
                console.warn('[ChatService] Failed to load channel context:', err);
            }
        }

        // 2. Intelligent Detection of Complex/Long-running Tasks
        // Instead of hardcoding keywords, we analyze the semantic intent
        const isComplexRequest = await this.detectComplexIntent(message);

        console.log(`[ChatService] Message: "${message.substring(0, 100)}..."`);
        console.log(`[ChatService] Complex request detected: ${isComplexRequest}`);

        if (isComplexRequest) {
            console.log(`[ChatService] 🚀 Processing complex request directly (no queue)...`);

            try {
                const resultJson = await WeeklyScheduler.generate(
                    userId,
                    personaId,
                    message,
                    channelContext
                );

                console.log(`[ChatService] ✅ Complex request completed (${resultJson.length} chars)`);
                return resultJson;
            } catch (error: any) {
                console.error(`[ChatService] ❌ Complex request failed:`, error);
                throw new Error(`Falha ao processar requisição complexa: ${error.message}`);
            }
        }

        // 3. Load Persona (Standard Flow)
        const persona = await prisma.persona.findUnique({
            where: { id: personaId }
        });

        if (!persona) {
            throw new Error('Persona not found');
        }

        /* 
           Logic for adding channelContext to standard prompt follows below...
           Notice we already computed channelContext, so we just append it.
        */

        // 4. Get AI Client
        const { client: ai, isSystem } = await KeyManager.getGeminiClient(userId);

        // 5. Construct System Instruction
        const currentDate = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        const baseSystemInstruction = persona.systemInstruction || 'You are a helpful AI assistant.';

        const jsonEnforcement = `
═══════════════════════════════════════
OUTPUT FORMAT ENFORCEMENT (CRITICAL)
═══════════════════════════════════════
Current Date: ${currentDate}

1. OUTPUT VALID JSON ONLY. No markdown formatted code blocks.
2. STRICTLY follow the schema defined in the System Instruction.
3. DO NOT OMIT REQUIRED FIELDS (like 'scenes' arrays), even for shorter content.
4. EVERY object in the 'cronograma' or 'scenes' list must be fully expanded.
5. If generating a Weekly Schedule, calculate dates from the NEXT Monday.
6. Format "id_da_semana" as: "(DD)-(DD)_(MMM)_(YY)" (e.g. "15-21_Dez_25").
═══════════════════════════════════════
`;

        const finalSystemInstruction = `${channelContext}\n\n${baseSystemInstruction}\n\n${jsonEnforcement}`;

        // 5. Execute Request
        const startTime = Date.now();
        let success = false;
        let error: any = null;

        try {
            const result = await executeRequest(isSystem, async () => {
                const response = await ai.models.generateContent({
                    model: "gemini-2.0-flash-exp",
                    contents: [
                        ...history,
                        { role: 'user', parts: [{ text: message }] }
                    ],
                    config: {
                        systemInstruction: finalSystemInstruction,
                        temperature: persona.temperature,
                        topP: persona.topP,
                        topK: persona.topK,
                        maxOutputTokens: 65536 // Force high limit for Gemini 2.0 Flash (supports huge output)
                    }
                });

                await trackUsage(userId, 'gemini', 'gemini-2.0-flash-exp', 'text');

                const responseText = response.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!responseText) throw new Error("No response generated");

                return responseText;
            }, userId);

            success = true;
            return result;

        } catch (e) {
            error = e;
            throw e;
        } finally {
            // 6. Usage Tracking
            const duration = Date.now() - startTime;
            try {
                // Log usage
                await prisma.personaUsageLog.create({
                    data: {
                        personaId: persona.id,
                        userId,
                        action: 'chat',
                        success,
                        duration,
                        errorMsg: error?.message,
                        metadata: {
                            messageLength: message.length,
                            channelId: channelId
                        }
                    }
                });

                // Update Stats
                await prisma.persona.update({
                    where: { id: persona.id },
                    data: {
                        usageCount: { increment: 1 },
                        lastUsedAt: new Date()
                    }
                });
            } catch (trackError) {
                console.error('[ChatService] Failed to track usage:', trackError);
            }
        }
    }

    /**
     * Detects if a request is complex and should be processed asynchronously
     * Uses semantic analysis instead of hardcoded keywords
     */
    private static async detectComplexIntent(message: string): Promise<boolean> {
        const lowerMessage = message.toLowerCase();

        // Pattern 1: Weekly/Monthly schedules in any language
        const schedulePatterns = [
            /\b(cronograma|planejamento|agenda|schedule|plan|calendar)\b.*\b(seman|week|mês|month)\b/i,
            /\b(week|seman|mês|month).*\b(cronograma|planejamento|schedule|plan)\b/i,
        ];

        // Pattern 2: Multiple projects/videos requests
        const bulkPatterns = [
            /\b(\d+)\s*(vídeos?|videos?|projetos?|projects?|ideias?|ideas?)\b/i,
            /\b(vários|múltiplos|diversos|many|multiple|several)\s*(vídeos?|videos?|projetos?|projects?)\b/i,
        ];

        // Pattern 3: Deep analysis requests
        const analysisPatterns = [
            /\b(anális[ei]|analysis|pesquis[ao]|research|estud[oa]|study)\s*(completa?|detalhada?|profunda?|deep|thorough|comprehensive)\b/i,
            /\b(completa?|detalhada?|profunda?|deep|thorough)\s*(anális[ei]|analysis|pesquis[ao]|research)\b/i,
        ];

        // Check all patterns
        const isSchedule = schedulePatterns.some(pattern => pattern.test(lowerMessage));
        const isBulk = bulkPatterns.some(pattern => pattern.test(lowerMessage));
        const isAnalysis = analysisPatterns.some(pattern => pattern.test(lowerMessage));

        // Also check message length - very long messages likely need more processing
        const isLongMessage = message.length > 500;

        return isSchedule || isBulk || isAnalysis || isLongMessage;
    }
}
