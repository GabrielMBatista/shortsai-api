import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/channels/[id]/persona/activate
 * Activate a persona for a channel (creates history entry)
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { personaId } = await req.json();

        if (!personaId) {
            return NextResponse.json({ error: 'Missing personaId' }, { status: 400 });
        }

        // Validate channel ownership
        const channel = await prisma.channel.findFirst({
            where: {
                id,
                userId: session.user.id,
            },
        });

        if (!channel) {
            return NextResponse.json(
                { error: 'Channel not found or unauthorized' },
                { status: 404 }
            );
        }

        // Deactivate current persona if exists
        if (channel.personaId) {
            await prisma.channelPersonaHistory.updateMany({
                where: {
                    channelId: id,
                    deactivatedAt: null,
                },
                data: {
                    deactivatedAt: new Date(),
                },
            });
        }

        // Update channel's active persona
        await prisma.channel.update({
            where: { id },
            data: { personaId },
        });

        // Create history entry
        const history = await prisma.channelPersonaHistory.create({
            data: {
                channelId: id,
                personaId,
                activatedAt: new Date(),
            },
        });

        return NextResponse.json({
            success: true,
            history,
        });
    } catch (error) {
        console.error('Activate persona error:', error);
        return NextResponse.json(
            {
                error: error instanceof Error ? error.message : 'Failed to activate persona',
            },
            { status: 500 }
        );
    }
}
