import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { ChannelService } from '@/lib/channels/channel-service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/channels/import
 * Importa um canal YouTube para o banco
 */
export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { accountId, youtubeChannelId } = await request.json();

        if (!accountId || !youtubeChannelId) {
            return NextResponse.json(
                { error: 'accountId and youtubeChannelId are required' },
                { status: 400 }
            );
        }

        const channel = await ChannelService.importChannel(
            session.user.id,
            accountId,
            youtubeChannelId
        );

        return NextResponse.json(channel, { status: 201 });
    } catch (error: any) {
        console.error('[POST /api/channels/import] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to import channel' },
            { status: 500 }
        );
    }
}
