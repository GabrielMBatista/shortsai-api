import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { handleError } from '@/lib/middleware/error-handler';
import { UnauthorizedError, NotFoundError, ForbiddenError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/**
 * GET /api/channels/[id]
 * Get channel details by ID
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

        reqLogger.debug({ channelId: id }, 'Fetching channel details');

        const channel = await prisma.channel.findUnique({
            where: { id },
            include: {
                persona: {
                    select: {
                        id: true,
                        name: true,
                        category: true,
                        type: true,
                        version: true
                    }
                },
                persona_history: {
                    orderBy: { switched_at: 'desc' },
                    take: 10
                }
            }
        });

        if (!channel) throw new NotFoundError('Channel', id);
        if (channel.user_id !== session.user.id) {
            throw new ForbiddenError('You do not have access to this channel');
        }

        const duration = Date.now() - startTime;
        reqLogger.info(
            { channelId: id, duration },
            `Channel retrieved in ${duration}ms`
        );

        return NextResponse.json(channel, {
            headers: { 'X-Request-ID': requestId }
        });
    } catch (error) {
        return handleError(error, requestId);
    }
}
