import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { ChannelService } from '@/lib/channels/channel-service';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/channels/:id/persona
 * Atribui ou remove persona de um canal
 */
export async function PATCH(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { personaId } = await request.json();

        const channel = await ChannelService.assignPersona(
            params.id,
            session.user.id,
            personaId || null
        );

        return NextResponse.json(channel);
    } catch (error: any) {
        console.error('[PATCH /api/channels/:id/persona] Error:', error);

        if (error.message.includes('acesso')) {
            return NextResponse.json({ error: error.message }, { status: 403 });
        }

        return NextResponse.json(
            { error: error.message || 'Failed to assign persona' },
            { status: 500 }
        );
    }
}
