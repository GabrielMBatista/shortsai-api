import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { SceneStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();

        // Determine type based on payload keys
        let type: 'image' | 'audio' | null = null;
        if (body.image_url && body.image_status) type = 'image';
        else if (body.audio_url && body.audio_status) type = 'audio';

        if (!type) {
            return NextResponse.json({ error: 'Invalid payload. Must contain image_url/status or audio_url/status' }, { status: 400 });
        }

        const url = body[`${type}_url`];
        const status = body[`${type}_status`];

        if (status !== 'completed') {
            return NextResponse.json({ error: 'Asset update must set status to completed' }, { status: 400 });
        }

        const scene = await prisma.scene.findUnique({
            where: { id },
            include: { project: true },
        });

        if (!scene) {
            return NextResponse.json({ error: 'Scene not found' }, { status: 404 });
        }

        // 1. Validate Project Status
        if (scene.project.status !== 'generating') {
            return NextResponse.json({
                error: `Project status is ${scene.project.status}, must be 'generating'`,
            }, { status: 400 });
        }

        // 2. Validate Current Scene Status
        // We expect the scene to be in 'loading' state for this asset type before we save it.
        const currentStatus = scene[`${type}_status` as keyof typeof scene] as SceneStatus;
        if (currentStatus !== 'processing') {
            return NextResponse.json({
                error: `Cannot save asset. Current status is ${currentStatus}, expected 'processing'.`,
            }, { status: 409 });
        }

        // 3. Update
        const updatedScene = await prisma.scene.update({
            where: { id },
            data: {
                [`${type}_url`]: url,
                [`${type}_status`]: status,
            },
        });

        return NextResponse.json(updatedScene);

    } catch (error: any) {
        console.error('Error updating scene asset:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
