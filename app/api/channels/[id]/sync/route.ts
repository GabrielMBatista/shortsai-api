import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { handleError } from '@/lib/middleware/error-handler';
import { UnauthorizedError, NotFoundError, ForbiddenError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/**
 * POST /api/channels/[id]/sync
 * Sync channel statistics
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

        reqLogger.info({ channelId: id }, 'Syncing channel stats from YouTube');

        const channel = await prisma.channel.findUnique({ where: { id } });
        if (!channel) throw new NotFoundError('Channel', id);
        if (channel.userId !== session.user.id) throw new ForbiddenError('Access denied');

        // ✅ Sincronizar dados reais do YouTube
        const { ChannelService } = await import('@/lib/channels/channel-service');
        const updatedChannel = await ChannelService.syncChannelStats(id);

        const duration = Date.now() - startTime;
        reqLogger.info({ channelId: id, duration }, `Channel synced successfully in ${duration}ms`);

        return NextResponse.json(
            updatedChannel,
            { headers: { 'X-Request-ID': requestId } }
        );
    } catch (error: any) {
        // Catch specific auth errors from ChannelService
        if (error.message === 'Refresh token não disponível' ||
            error.message.includes('Sua conexão com o Google expirou') ||
            error.message.includes('invalid_grant')) {

            // Return 401 with a clear message for the frontend
            return NextResponse.json(
                {
                    error: 'Authentication failed',
                    code: 'AUTH_REQUIRED',
                    message: 'Sua conexão com o Google expirou. Por favor, reconecte sua conta.'
                },
                { status: 401, headers: { 'X-Request-ID': requestId } }
            );
        }

        return handleError(error, requestId);
    }
}
