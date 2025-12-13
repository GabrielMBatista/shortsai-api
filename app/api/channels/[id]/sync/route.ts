
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { ChannelService } from '@/lib/channels/channel-service';

export const dynamic = 'force-dynamic';

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const channel = await ChannelService.syncChannelStats(id);

        return NextResponse.json(channel);
    } catch (error: any) {
        console.error('[POST /api/channels/[id]/sync]', error);
        return NextResponse.json(
            { error: error.message || 'Failed to sync channel' },
            { status: 500 }
        );
    }
}
