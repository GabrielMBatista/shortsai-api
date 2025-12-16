import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { auth } from '@/lib/auth';
import { PersonaService } from '@/lib/personas/persona-service';
import { createRequestLogger } from '@/lib/logger';
import { handleError } from '@/lib/middleware/error-handler';
import { UnauthorizedError, ForbiddenError, BadRequestError } from '@/lib/errors';
// ❌ ZOD REMOVIDO - Validação Zod removida por incompatibilidade com contrato frontend

export const dynamic = 'force-dynamic';

/**
 * GET /api/personas
 * List available personas for the authenticated user
 */
export async function GET(request: NextRequest) {
    const requestId = request.headers.get('x-request-id') || randomUUID();
    const startTime = Date.now();

    try {
        const session = await auth();
        if (!session?.user?.id) throw new UnauthorizedError();

        const reqLogger = createRequestLogger(requestId, session.user.id);
        reqLogger.info('Fetching available personas');

        const personas = await PersonaService.getAvailablePersonas(session.user.id);

        const duration = Date.now() - startTime;
        reqLogger.info(
            { personaCount: personas.length, duration },
            `Personas retrieved in ${duration}ms`
        );

        return NextResponse.json(
            { personas, total: personas.length },
            { headers: { 'X-Request-ID': requestId } }
        );
    } catch (error) {
        return handleError(error, requestId);
    }
}

/**
 * POST /api/personas
 * Create a custom persona
 */
export async function POST(request: NextRequest) {
    const requestId = request.headers.get('x-request-id') || randomUUID();
    const startTime = Date.now();

    try {
        const session = await auth();
        if (!session?.user?.id) throw new UnauthorizedError();

        const reqLogger = createRequestLogger(requestId, session.user.id);
        reqLogger.info('Creating custom persona');

        // ❌ ZOD REMOVIDO - Parse JSON direto
        const body = await request.json();
        const { name, description, category, system_prompt } = body;

        if (!name || !category) {
            throw new BadRequestError('Name and category are required');
        }

        const persona = await PersonaService.createCustomPersona(session.user.id, {
            name,
            description,
            category,
            systemInstruction: system_prompt || ''  // Safe fallback
        });

        const duration = Date.now() - startTime;
        reqLogger.info(
            { personaId: persona.id, name, duration },
            `Persona created in ${duration}ms`
        );

        return NextResponse.json(persona, {
            status: 201,
            headers: { 'X-Request-ID': requestId }
        });
    } catch (error: any) {
        if (error.message?.includes('Limite')) {
            return handleError(new ForbiddenError(error.message), requestId);
        }
        return handleError(error, requestId);
    }
}
