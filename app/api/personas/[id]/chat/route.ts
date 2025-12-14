import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { ChatService } from '@/lib/ai/services/chat-service';

export const dynamic = 'force-dynamic';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id: personaId } = await params;
        const body = await request.json();
        const { message, history, channelId } = body;

        if (!message) {
            return NextResponse.json({ error: 'Message is required' }, { status: 400 });
        }

        const response = await ChatService.chatWithPersona(
            session.user.id,
            personaId,
            message,
            history || [],
            channelId
        );

        return NextResponse.json({ response });
    } catch (error: any) {
        console.error('[POST /api/personas/[id]/chat] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to chat with persona' },
            { status: 500 }
        );
    }
}
