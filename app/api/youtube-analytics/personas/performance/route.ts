import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPersonaPerformance } from '@/lib/youtube-analytics/analytics-service';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/youtube-analytics/personas/performance?channelId=xxx
 * Get performance comparison by persona
 */
export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const channelId = searchParams.get('channelId');

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

        const performance = await getPersonaPerformance(channelId);

        return NextResponse.json({ performance });
    } catch (error) {
        console.error('Get persona performance error:', error);
        return NextResponse.json(
            {
                error:
                    error instanceof Error ? error.message : 'Failed to get persona performance',
            },
            { status: 500 }
        );
    }
}
