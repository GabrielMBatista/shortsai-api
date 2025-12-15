import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { PersonaService } from '@/lib/personas/persona-service';
import { createRequestLogger } from '@/lib/logger';
import { handleError } from '@/lib/middleware/error-handler';
import { UnauthorizedError, NotFoundError, ForbiddenError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/**
 * GET /api/personas/[id]
 * Get persona details by ID
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

        reqLogger.debug({ personaId: id }, 'Fetching persona details');

        const persona = await PersonaService.getPersona(id);
        if (!persona) throw new NotFoundError('Persona', id);

        const hasAccess = await PersonaService.canAccessPersona(session.user.id, id);
        if (!hasAccess) throw new ForbiddenError('You do not have access to this persona');

        const duration = Date.now() - startTime;
        reqLogger.info(
            { personaId: id, duration },
            `Persona retrieved in ${duration}ms`
        );

        return NextResponse.json(persona, {
            headers: { 'X-Request-ID': requestId }
        });
    } catch (error) {
        return handleError(error, requestId);
    }
}

/**
 * PATCH /api/personas/[id]
 * Update persona details
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

        reqLogger.info({ personaId: id }, 'Updating persona');

        const body = await request.json();
        const persona = await PersonaService.updatePersona(id, session.user.id, body);

        const duration = Date.now() - startTime;
        reqLogger.info(
            { personaId: id, duration },
            `Persona updated in ${duration}ms`
        );

        return NextResponse.json(persona, {
            headers: { 'X-Request-ID': requestId }
        });
    } catch (error: any) {
        if (error.message?.includes('permissão')) {
            return handleError(new ForbiddenError(error.message), requestId);
        }
        return handleError(error, requestId);
    }
}

/**
 * DELETE /api/personas/[id]
 * Delete a custom persona
 */
export async function DELETE(
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

        reqLogger.info({ personaId: id }, 'Deleting persona');

        const hasAccess = await PersonaService.canAccessPersona(session.user.id, id);
        if (!hasAccess) throw new ForbiddenError('Access denied');

        await prisma.persona.delete({ where: { id } });

        const duration = Date.now() - startTime;
        reqLogger.info(
            { personaId: id, duration },
            `Persona deleted in ${duration}ms`
        );

        return NextResponse.json(
            { success: true },
            { headers: { 'X-Request-ID': requestId } }
        );
    } catch (error: any) {
        if (error.message?.includes('permissão')) {
            return handleError(new ForbiddenError(error.message), requestId);
        }
        return handleError(error, requestId);
    }
}
