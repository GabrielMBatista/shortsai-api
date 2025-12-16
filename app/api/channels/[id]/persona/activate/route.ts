import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { logger, createRequestLogger } from '@/lib/logger';
import { handleError } from '@/lib/middleware/error-handler';
import { UnauthorizedError, NotFoundError, BadRequestError } from '@/lib/errors';
// ❌ ZOD REMOVIDO - Validação Zod removida por incompatibilidade com contrato frontend

/**
 * POST /api/channels/[id]/persona/activate
 * Activate a persona for a specific channel
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const requestId = req.headers.get('x-request-id') || randomUUID();
    const { id: channelId } = await params;

    try {
        // Authenticate user
        const session = await auth();
        if (!session?.user?.id) {
            throw new UnauthorizedError();
        }

        const reqLogger = createRequestLogger(requestId, session.user.id);
        reqLogger.info({ channelId }, 'Activating persona for channel');

        // ❌ ZOD REMOVIDO - Parse JSON direto
        const body = await req.json();
        const { personaId } = body;

        if (!personaId) {
            throw new BadRequestError('personaId is required');
        }

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

        logger.info(`Activating persona ${personaId} for channel ${channelId}`);

        // Update channel persona and add to history
        const [updatedChannel] = await Promise.all([
            prisma.channel.update({
                where: { id: channelId },
                data: { personaId },
                include: {
                    persona: {
                        select: {
                            id: true,
                            name: true,
                            description: true,
                            category: true,
                            systemInstruction: true,
                        },
                    },
                },
            }),
            prisma.channelPersonaHistory.create({
                data: {
                    channelId,
                    personaId,
                    activatedAt: new Date(),
                },
            }),
        ]);

        return NextResponse.json(
            {
                success: true,
                channel: updatedChannel,
            },
            {
                status: 200,
                headers: { 'X-Request-ID': requestId },
            }
        );
    } catch (error) {
        return handleError(error, requestId);
    }
}
