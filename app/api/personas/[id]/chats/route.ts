import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { PersonaChatService } from '@/lib/personas/persona-chat-service';

/**
 * GET /api/personas/[id]/chats
 * Lista todos os chats ativos de uma persona
 */
export async function GET(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const personaId = params.id;
        const chats = await PersonaChatService.getUserChats(session.user.id, personaId);

        return NextResponse.json(chats);
    } catch (error: any) {
        console.error('[GET /api/personas/[id]/chats] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/personas/[id]/chats
 * Cria um novo chat
 */
export async function POST(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const personaId = params.id;
        const body = await req.json();
        const { channelId, title } = body;

        const chat = await PersonaChatService.createChat(
            session.user.id,
            personaId,
            channelId,
            title
        );

        return NextResponse.json(chat, { status: 201 });
    } catch (error: any) {
        console.error('[POST /api/personas/[id]/chats] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
