import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { PersonaService } from '@/lib/personas/persona-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/personas
 * Lista personas disponíveis para o usuário
 */
export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const personas = await PersonaService.getAvailablePersonas(session.user.id);

        return NextResponse.json({
            personas,
            total: personas.length
        });
    } catch (error: any) {
        console.error('[GET /api/personas] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/personas
 * Cria uma persona CUSTOM
 */
export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { name, description, category, systemInstruction, temperature, topP, topK, maxOutputTokens, tags } = body;

        if (!name || !systemInstruction) {
            return NextResponse.json(
                { error: 'Name and systemInstruction are required' },
                { status: 400 }
            );
        }

        const persona = await PersonaService.createCustomPersona(session.user.id, {
            name,
            description,
            category,
            systemInstruction,
            temperature,
            topP,
            topK,
            maxOutputTokens,
            tags
        });

        return NextResponse.json(persona, { status: 201 });
    } catch (error: any) {
        console.error('[POST /api/personas] Error:', error);

        if (error.message.includes('Limite')) {
            return NextResponse.json({ error: error.message }, { status: 403 });
        }

        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}
