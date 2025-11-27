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
        const { sfx_url, sfx_status } = body;

        if (!sfx_url || sfx_status !== 'completed') {
            return NextResponse.json({ error: 'Invalid payload. Must contain sfx_url and sfx_status=completed' }, { status: 400 });
        }

        const scene = await prisma.scene.findUnique({
            where: { id },
            include: { project: true },
        });

        if (!scene) {
            return NextResponse.json({ error: 'Scene not found' }, { status: 404 });
        }

        // 1. Validate Project Status (Relaxed)
        // if (scene.project.status !== 'generating') { ... }

        // 2. Validate Current Status (Relaxed)
        if (scene.sfx_status !== 'processing') {
            console.warn(`Saving SFX for scene ${id} but status is ${scene.sfx_status} (expected 'processing'). Proceeding anyway.`);
        }

        // 3. Update
        const updatedScene = await prisma.scene.update({
            where: { id },
            data: {
                sfx_url,
                sfx_status,
            },
        });

        return NextResponse.json(updatedScene);

    } catch (error: any) {
        console.error('Error updating scene sfx:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
