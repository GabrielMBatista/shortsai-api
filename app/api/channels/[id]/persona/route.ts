import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { handleError } from '@/lib/middleware/error-handler';
import { UnauthorizedError, NotFoundError, ForbiddenError, BadRequestError } from '@/lib/errors';
// ❌ ZOD REMOVIDO - Validação Zod removida por incompatibilidade com contrato frontend

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/channels/[id]/persona
 * Update channel's active persona
 */
export async function PATCH(
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

        // ❌ ZOD REMOVIDO - Parse JSON direto
        const body = await request.json();
        const { personaId } = body;

        if (!personaId) {
            throw new BadRequestError('personaId is required');
        }

        reqLogger.info({ channelId: id, personaId }, 'Updating channel persona');

        const channel = await prisma.channel.findUnique({ where: { id } });
        if (!channel) throw new NotFoundError('Channel', id);
        if (channel.userId !== session.user.id) throw new ForbiddenError('Access denied');

        const updated = await prisma.channel.update({
            where: { id },
            data: { personaId },
            include: { persona: true }
        });

        const duration = Date.now() - startTime;
        reqLogger.info({ channelId: id, duration }, `Persona updated in ${duration}ms`);

        return NextResponse.json(updated, {
            headers: { 'X-Request-ID': requestId }
        });
    } catch (error) {
        return handleError(error, requestId);
    }
}
