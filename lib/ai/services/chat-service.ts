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
                    ChannelService.getChannelVideos(channelId, { maxResults: 15, orderBy: 'viewCount' })
                ]);

                const formatViews = (views: number) => {
                    if (views >= 1000000) return `${(views / 1000000).toFixed(1)}M`;
                    if (views >= 1000) return `${(views / 1000).toFixed(1)}K`;
                    return views.toString();
                };

                const topVideos = youtubeVideos.slice(0, 5).map(v =>
                    `- "${v.title}" (${formatViews(v.statistics.viewCount)} views)`
                ).join('\n');

                channelContext = `
═══════════════════════════════════════
CHANNEL INTELLIGENCE & PERFORMANCE DATA
═══════════════════════════════════════
Use this data to generate high-performing, viral content tailored to this channel's audience.

🔥 TOP PERFORMING VIDEOS (Do more of this style/topic):
${topVideos || "No data available."}

📅 RECENT PROJECTS (Avoid exact repetition, find new angles):
${recentProjects.map(p => `- ${p.generated_title || p.topic}`).join('\n') || "None recent."}

STRATEGIC INSTRUCTIONS:
1. Analyze why the top videos succeeded (audience interest, hook, topic).
2. Suggest ideas that align with these winning patterns but offer a fresh perspective.
3. AVOID repeating recently covered topics unless you have a distinct, novel angle.
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
OUTPUT FORMAT ENFORCEMENT
═══════════════════════════════════════
Current Date: ${currentDate}

1. You MUST output VALID JSON ONLY.
2. Do NOT use markdown code blocks (like \`\`\`json). Just raw JSON.
3. Follow the schema and format rules defined in your System Instruction exactly.
4. If generating a Weekly Schedule (Cronograma), calculate the dates starting from the NEXT Monday based on the Current Date.
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
