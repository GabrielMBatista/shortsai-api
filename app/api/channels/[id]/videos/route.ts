import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { auth } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { handleError } from '@/lib/middleware/error-handler';
import { UnauthorizedError, NotFoundError } from '@/lib/errors';
import { ChannelService } from '@/lib/services/channel-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/channels/[id]/videos
 * Get videos list for a specific channel
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const requestId = request.headers.get('x-request-id') || randomUUID();
    const startTime = Date.now();

    try {
        const session = await auth();
        if (!session?.user?.id) throw new UnauthorizedError();

        const reqLogger = createRequestLogger(requestId, session.user.id);
        const { id } = await params;
        const { searchParams } = new URL(request.url);
        const limit = parseInt(searchParams.get('limit') || '50');

        reqLogger.debug({ channelId: id, limit }, 'Fetching channel videos');

        const videos = await ChannelService.getChannelVideos(id, session.user.id, limit);

        if (!videos) throw new NotFoundError('Channel videos');

        const duration = Date.now() - startTime;
        reqLogger.info(
            { channelId: id, videoCount: videos.length, duration },
            `Videos retrieved in ${duration}ms`
        );

        return NextResponse.json(
            { videos, total: videos.length },
            { headers: { 'X-Request-ID': requestId } }
        );
    } catch (error) {
        return handleError(error, requestId);
    }
}
