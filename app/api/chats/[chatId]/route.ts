import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { PersonaChatService } from '@/lib/personas/persona-chat-service';

/**
 * GET /api/chats/[chatId]
 * Busca um chat específico (apenas do usuário autenticado)
 */
export async function GET(
    req: NextRequest,
    { params }: { params: { chatId: string } }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const chat = await PersonaChatService.getChat(params.chatId, session.user.id);
        return NextResponse.json(chat);
    } catch (error: any) {
        console.error('[GET /api/chats/[chatId]] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: error.message === 'Chat not found or expired' ? 404 : 500 }
        );
    }
}

/**
 * PATCH /api/chats/[chatId]
 * Atualiza o título de um chat (apenas do usuário autenticado)
 */
export async function PATCH(
    req: NextRequest,
    { params }: { params: { chatId: string } }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { title } = body;

        if (!title || typeof title !== 'string') {
            return NextResponse.json({ error: 'Title is required' }, { status: 400 });
        }

        const chat = await PersonaChatService.updateChatTitle(
            params.chatId,
            session.user.id,
            title
        );

        return NextResponse.json(chat);
    } catch (error: any) {
        console.error('[PATCH /api/chats/[chatId]] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: error.message === 'Chat not found or expired' ? 404 : 500 }
        );
    }
}

/**
 * DELETE /api/chats/[chatId]
 * Remove um chat (apenas do usuário autenticado)
 */
export async function DELETE(
    req: NextRequest,
    { params }: { params: { chatId: string } }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await PersonaChatService.deleteChat(params.chatId, session.user.id);
        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('[DELETE /api/chats/[chatId]] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: error.message === 'Chat not found' ? 404 : 500 }
        );
    }
}
