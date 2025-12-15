import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logger, createRequestLogger } from '@/lib/logger';
import { handleError } from '@/lib/middleware/error-handler';
import { UnauthorizedError, NotFoundError } from '@/lib/errors';
import { validateRequest } from '@/lib/validation';
import { activatePersonaSchema } from '@/lib/schemas';

/**
 * POST /api/channels/[id]/persona/activate
 * Activate a persona for a channel (creates history entry)
 * 
 * @param req - Next.js request object
 * @param params - Route parameters (channel ID)
 * @returns JSON response with success status and history entry
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    // Generate or extract request ID for tracing
    const requestId = req.headers.get('x-request-id') || randomUUID();
    const startTime = Date.now();

    try {
        const { id: channelId } = await params;

        // Authenticate user
        const session = await auth();
        if (!session?.user?.id) {
            throw new UnauthorizedError();
        }

        const reqLogger = createRequestLogger(requestId, session.user.id);
        reqLogger.info({ channelId }, 'Activating persona for channel');

        // Validate request body with Zod
        const { personaId } = await validateRequest(req, activatePersonaSchema);

        // Validate channel ownership
        const channel = await prisma.channel.findFirst({
            where: {
                id: channelId,
                userId: session.user.id,
            },
        });

        if (!channel) {
            throw new NotFoundError('Channel', channelId);
        }

        // Deactivate current persona if exists
        if (channel.personaId) {
            reqLogger.debug(
                { previousPersonaId: channel.personaId },
                'Deactivating previous persona'
            );

            await prisma.channelPersonaHistory.updateMany({
                where: {
                    channelId,
                    deactivatedAt: null,
                },
                data: {
                    deactivatedAt: new Date(),
                },
            });
        }

        // Update channel's active persona
        await prisma.channel.update({
            where: { id: channelId },
            data: { personaId },
        });

        // Create history entry
        const history = await prisma.channelPersonaHistory.create({
            data: {
                channelId,
                personaId,
                activatedAt: new Date(),
            },
        });

        const duration = Date.now() - startTime;
        reqLogger.info(
            {
                channelId,
                personaId,
                duration,
            },
            `Persona activated successfully in ${duration}ms`
        );

        return NextResponse.json(
            {
                success: true,
                history,
            },
            {
                headers: {
                    'X-Request-ID': requestId,
                },
            }
        );
    } catch (error) {
        return handleError(error, requestId);
    }
}
