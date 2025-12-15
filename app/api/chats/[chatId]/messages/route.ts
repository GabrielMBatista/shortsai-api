import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { PersonaChatService } from '@/lib/personas/persona-chat-service';

/**
 * POST /api/chats/[chatId]/messages
 * Adiciona uma mensagem a um chat (apenas do usuário autenticado)
 */
export async function POST(
    req: NextRequest,
    { params }: { params: { chatId: string } }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { role, content } = body;

        if (!role || !content || !['user', 'model'].includes(role)) {
            return NextResponse.json(
                { error: 'Invalid role or content' },
                { status: 400 }
            );
        }

        const message = await PersonaChatService.addMessage(
            params.chatId,
            session.user.id,
            role,
            content
        );

        return NextResponse.json(message, { status: 201 });
    } catch (error: any) {
        console.error('[POST /api/chats/[chatId]/messages] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: error.message === 'Chat not found or expired' ? 404 : 500 }
        );
    }
}
