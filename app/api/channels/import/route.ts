import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { auth } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { handleError } from '@/lib/middleware/error-handler';
import { UnauthorizedError } from '@/lib/errors';
import { validateRequest } from '@/lib/validation';
import { z } from 'zod';
import { ChannelService } from '@/lib/services/channel-service';

export const dynamic = 'force-dynamic';

const importChannelSchema = z.object({
    youtubeChannelId: z.string().min(1),
    accountId: z.string().uuid().optional()
});

/**
 * POST /api/channels/import
 * Import a YouTube channel
 */
export async function POST(request: NextRequest) {
    const requestId = request.headers.get('x-request-id') || randomUUID();
    const startTime = Date.now();

    try {
        const session = await auth();
        if (!session?.user?.id) throw new UnauthorizedError();

        const reqLogger = createRequestLogger(requestId, session.user.id);
        reqLogger.info('Importing YouTube channel');

        const { youtubeChannelId, accountId } = await validateRequest(
            request,
            importChannelSchema
        );

        const channel = await ChannelService.importChannel(
            session.user.id,
            youtubeChannelId,
            accountId
        );

        const duration = Date.now() - startTime;
        reqLogger.info(
            {
                channelId: channel.id,
                youtubeChannelId,
                duration
            },
            `Channel imported in ${duration}ms`
        );

        return NextResponse.json(channel, {
            status: 201,
            headers: { 'X-Request-ID': requestId }
        });
    } catch (error) {
        return handleError(error, requestId);
    }
}
