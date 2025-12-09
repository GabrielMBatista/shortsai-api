import { NextRequest, NextResponse } from 'next/server';
import { videoTransferQueue } from '@/lib/queues';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
    try {
        const token = req.headers.get('x-goog-channel-token');
        const resourceState = req.headers.get('x-goog-resource-state');
        const channelId = req.headers.get('x-goog-channel-id');
        const resourceId = req.headers.get('x-goog-resource-id');

        console.log(`Webhook received: State=${resourceState}, Channel=${channelId}`);

        if (!channelId) {
            return NextResponse.json({ error: 'Missing Channel ID' }, { status: 400 });
        }

        // 1. Verify Request (Basic)
        // In production, validate token against a stored secret or userId

        // 2. Identify Account
        const account = await prisma.account.findFirst({
            where: { driveChannelId: channelId },
        });

        if (!account) {
            console.warn(`Webhook received for unknown channel: ${channelId}`);
            // Return 200 to stop Google from retrying if we deleted the channel locally
            return NextResponse.json({ status: 'ignored_unknown_channel' });
        }

        // 3. Handle Sync Verification
        if (resourceState === 'sync') {
            console.log(`Channel ${channelId} verified successfully.`);
            return NextResponse.json({ status: 'verified' });
        }

        // 4. Queue Sync Job
        // We don't process files here to avoid timeouts.
        if (resourceState === 'add' || resourceState === 'update' || resourceState === 'change') {
            await videoTransferQueue.add('sync-drive', {
                userId: account.userId,
                accountId: account.id,
                channelId,
                resourceId
            }, {
                removeOnComplete: true,
                attempts: 3
            });

            console.log(`Queued sync-drive for user ${account.userId}`);
        }

        return NextResponse.json({ status: 'ok' });

    } catch (err: any) {
        console.error('Webhook Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
