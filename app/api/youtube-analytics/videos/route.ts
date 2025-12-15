import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
    getTopVideos,
    getBottomVideos,
    generateVideoInsights,
} from '@/lib/youtube-analytics/analytics-service';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/youtube-analytics/videos?channelId=xxx&type=top|bottom&period=last7days|alltime
 * Get top or bottom performing videos for a channel
 */
export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const channelId = searchParams.get('channelId');
        const type = searchParams.get('type') || 'top';
        const period = searchParams.get('period') || 'alltime';
        const limit = parseInt(searchParams.get('limit') || '5', 10);

        if (!channelId) {
            return NextResponse.json({ error: 'Missing channelId' }, { status: 400 });
        }

        // Validate channel ownership
        const channel = await prisma.channel.findFirst({
            where: {
                id: channelId,
                userId: session.user.id,
            },
        });

        if (!channel) {
            return NextResponse.json(
                { error: 'Channel not found or unauthorized' },
                { status: 404 }
            );
        }

        // Get videos based on type
        let videos;
        if (type === 'bottom') {
            videos = await getBottomVideos(channelId, limit);
        } else {
            videos = await getTopVideos(
                channelId,
                period as 'last7days' | 'alltime',
                limit
            );
        }

        // Generate insights for each video if not already generated
        await Promise.all(
            videos.map((video) =>
                generateVideoInsights(video.id).catch((err) =>
                    console.error(`Failed to generate insights for ${video.id}:`, err)
                )
            )
        );

        // Fetch videos again with insights
        const videosWithInsights = await prisma.youtubeVideo.findMany({
            where: {
                id: { in: videos.map((v) => v.id) },
            },
            include: {
                persona: {
                    select: { id: true, name: true },
                },
                insights: true,
                metrics: {
                    orderBy: { date: 'desc' },
                    take: 1,
                },
            },
        });

        return NextResponse.json({ videos: videosWithInsights });
    } catch (error) {
        console.error('Get videos error:', error);
        return NextResponse.json(
            {
                error: error instanceof Error ? error.message : 'Failed to get videos',
            },
            { status: 500 }
        );
    }
}
