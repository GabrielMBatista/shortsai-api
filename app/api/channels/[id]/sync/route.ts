import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { auth } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { handleError } from '@/lib/middleware/error-handler';
import { UnauthorizedError } from '@/lib/errors';
import { ChannelService } from '@/lib/services/channel-service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/channels/[id]/sync
 * Sync channel statistics with YouTube
 */
export async function POST(
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

        reqLogger.info({ channelId: id }, 'Syncing channel statistics');

        await ChannelService.syncChannelStats(id, session.user.id);

        const duration = Date.now() - startTime;
        reqLogger.info(
            { channelId: id, duration },
            `Channel synced in ${duration}ms`
        );

        return NextResponse.json(
            { success: true, message: 'Channel synced successfully' },
            { headers: { 'X-Request-ID': requestId } }
        );
    } catch (error) {
        return handleError(error, requestId);
    }
}
