import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { ChatService } from '@/lib/ai/services/chat-service';
import { scheduleQueue, ScheduleJobData } from '@/lib/queues/schedule-queue';

export const dynamic = 'force-dynamic';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id: personaId } = await params;
        const body = await request.json();
        const { message, history, channelId, chatId, language, voice } = body;

        if (!message) {
            return NextResponse.json({ error: 'Message is required' }, { status: 400 });
        }

        // Check if this is a complex request (schedule generation)
        const isComplexRequest = await ChatService.detectComplexIntent(message);

        if (isComplexRequest) {
            // Build channel context
            let channelContext = '';
            if (channelId) {
                try {
                    const { ChannelService } = await import('@/lib/channels/channel-service');
                    const { prisma } = await import('@/lib/prisma');

                    const [recentProjects, youtubeVideos] = await Promise.all([
                        prisma.project.findMany({
                            where: { channel_id: channelId, status: 'completed' },
                            orderBy: { created_at: 'desc' },
                            take: 5,
                            select: { topic: true, generated_title: true }
                        }),
                        ChannelService.getChannelVideos(channelId, { maxResults: 50, orderBy: 'date' })
                    ]);

                    const formatNum = (num: number) => {
                        if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
                        if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
                        return num.toString();
                    };

                    const videoList = youtubeVideos.map(v =>
                        `${v.title.substring(0, 50)} (V:${formatNum(v.statistics.viewCount)})`
                    ).join(' | ');

                    channelContext = `\n═══════════════════════════════════════\nCHANNEL PERFORMANCE (Last 50 Videos)\n═══════════════════════════════════════\n${videoList}\n\nINSTRUCTIONS:\n1. Analyze the entire performance range.\n2. High performers: What topics drive views?\n3. Low performers: What to AVOID.\n4. Freshness: Suggest content that hasn't been overused.\n═══════════════════════════════════════\n`;
                } catch (err) {
                    console.warn('[Chat] Failed to load channel context:', err);
                }
            }

            // Add job to BullMQ queue
            const jobData: ScheduleJobData = {
                userId: session.user.id,
                personaId,
                message,
                channelContext,
                language,
                voice
            };

            const job = await scheduleQueue.add('generate-schedule', jobData, {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 2000
                }
            });

            return NextResponse.json({
                jobId: job.id,
                status: 'pending',
                message: 'Schedule generation started. Poll /api/personas/jobs/{jobId} for status.'
            });
        }

        // Simple chat (synchronous)
        const response = await ChatService.chatWithPersona(
            session.user.id,
            personaId,
            message,
            history || [],
            channelId,
            language,
            voice,
            chatId
        );

        return NextResponse.json({ response });
    } catch (error: any) {
        console.error('[POST /api/personas/[id]/chat] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to chat with persona' },
            { status: 500 }
        );
    }
}
