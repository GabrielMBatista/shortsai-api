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
        let type: 'image' | 'audio' | 'video' | null = null;
        if (body.image_url && body.image_status) type = 'image';
        else if (body.audio_url && body.audio_status) type = 'audio';
        else if (body.video_url && body.video_status) type = 'video';

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

        // 1. Validate Project Status (Relaxed for manual/paused operations)
        // if (scene.project.status !== 'generating') { ... }

        // 2. Validate Current Scene Status (Relaxed)
        const currentStatus = scene[`${type}_status` as keyof typeof scene] as SceneStatus;
        if (currentStatus !== 'processing') {
            console.warn(`Saving asset for scene ${id} but status is ${currentStatus} (expected 'processing'). Proceeding anyway.`);
        }

        // 3. Update with R2 Upload
        const { uploadBase64ToR2 } = await import('@/lib/storage');
        let finalUrl = url;

        // If it's a data URI (which it likely is if coming from manual editor or frontend generation), process it.
        // It detects mime/type automatically.
        if (url && url.startsWith('data:')) {
             try {
                // Determine folder based on type
                const folderMap = { 'image': 'scenes/images', 'audio': 'scenes/audio', 'video': 'scenes/videos' } as const;
                const folder = folderMap[type] || 'scenes/images';
                
                const r2Url = await uploadBase64ToR2(url, folder);
                if (r2Url) {
                    finalUrl = r2Url;
                    console.log(`[AssetRoute] Uploaded asset to R2: ${finalUrl}`);
                }
             } catch (e) {
                 console.error('[AssetRoute] R2 Upload failed', e);
                 // Fallback to storing base64 (not recommended but preserves data) or error?
                 // For now, let's proceed with base64 if upload fails, but log heavily.
             }
        }

        const updatedScene = await prisma.scene.update({
            where: { id },
            data: {
                [`${type}_url`]: finalUrl,
                [`${type}_status`]: status,
            },
        });

        return NextResponse.json(updatedScene);

    } catch (error: any) {
        console.error('Error updating scene asset:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
