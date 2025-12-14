import { prisma } from '@/lib/prisma';
import { KeyManager } from '../core/key-manager';
import { executeRequest } from '../core/executor';
import { trackUsage } from '../core/usage-tracker';

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
        // 1. Load Persona
        const persona = await prisma.persona.findUnique({
            where: { id: personaId }
        });

        if (!persona) {
            throw new Error('Persona not found');
        }

        // 2. Fetch Channel Context (if provided)
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

                // Format: "Title" (Views: 10K | Likes: 500)
                const videoList = youtubeVideos.map(v =>
                    `- "${v.title}" (Views: ${formatNum(v.statistics.viewCount)} | Likes: ${formatNum(v.statistics.likeCount)})`
                ).join('\n');

                channelContext = `
═══════════════════════════════════════
CHANNEL CONTEXT & PERFORMANCE DATA
═══════════════════════════════════════
Use this data to analyze performance trends and optimize your content.

📊 RECENT VIDEO ANALYSIS (Last 50 Videos):
${videoList || "No data available."}

📅 RECENT PROJECTS (Avoid exact repetition):
${recentProjects.map(p => `- ${p.generated_title || p.topic}`).join('\n') || "None recent."}

STRATEGIC INSTRUCTIONS (INTERNAL PROCESSING):
1. Analyze the list above. Identify High-Performing vs Low-Performing outliers.
2. Look for correlation between Titles/Topics and engagement (Views/Likes).
3. APPLY insights to the generated JSON:
   - Adopt successful Hook structures and Keywords.
   - Avoid topics that consistently underperform.
4. Do NOT output analysis text. Output VALID JSON ONLY.
═══════════════════════════════════════
`;
            } catch (err) {
                console.warn('[ChatService] Failed to load channel context:', err);
            }
        }

        // 3. Get AI Client
        const { client: ai, isSystem } = await KeyManager.getGeminiClient(userId);

        // 4. Construct System Instruction
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
                        maxOutputTokens: persona.maxOutputTokens
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
}
