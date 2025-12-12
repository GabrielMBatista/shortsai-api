import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { ChannelService } from '@/lib/channels/channel-service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/channels/discover
 * Descobre canais YouTube disponíveis de uma conta Google
 */
export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { accountId } = await request.json();
        if (!accountId) {
            return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
        }

        const channels = await ChannelService.discoverChannels(session.user.id, accountId);

        return NextResponse.json({
            channels,
            total: channels.length
        });
    } catch (error: any) {
        console.error('[POST /api/channels/discover] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to discover channels' },
            { status: 500 }
        );
    }
}
