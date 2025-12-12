import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { PersonaService } from '@/lib/personas/persona-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/personas/:id
 * Obtém detalhes de uma persona
 */
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const persona = await PersonaService.getPersona(id);
        if (!persona) {
            return NextResponse.json({ error: 'Persona not found' }, { status: 404 });
        }

        // Verificar acesso
        const hasAccess = await PersonaService.canAccessPersona(session.user.id, id);
        if (!hasAccess) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        return NextResponse.json(persona);
    } catch (error: any) {
        console.error('[GET /api/personas/:id] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}

/**
 * PATCH /api/personas/:id
 * Atualiza uma persona
 */
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const body = await request.json();
        const persona = await PersonaService.updatePersona(id, session.user.id, body);

        return NextResponse.json(persona);
    } catch (error: any) {
        console.error('[PATCH /api/personas/:id] Error:', error);

        if (error.message.includes('permissão')) {
            return NextResponse.json({ error: error.message }, { status: 403 });
        }

        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}
