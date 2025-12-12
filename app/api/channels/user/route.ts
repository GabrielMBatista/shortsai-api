import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { ChannelService } from '@/lib/channels/channel-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/channels/user
 * Lista canais do usuário logado
 */
export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const channels = await ChannelService.getUserChannels(session.user.id);

        return NextResponse.json({
            channels,
            total: channels.length
        });
    } catch (error: any) {
        console.error('[GET /api/channels/user] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to fetch channels' },
            { status: 500 }
        );
    }
}
