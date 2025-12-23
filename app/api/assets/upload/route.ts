import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { uploadBufferToR2 } from '@/lib/storage';

export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const formData = await req.formData();
        const file = formData.get('file') as File;
        const sceneId = formData.get('sceneId') as string;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        if (!sceneId) {
            return NextResponse.json({ error: 'Scene ID required' }, { status: 400 });
        }

        // Validate file type
        const validImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        const validVideoTypes = ['video/mp4', 'video/webm', 'video/quicktime'];

        const isImage = validImageTypes.includes(file.type);
        const isVideo = validVideoTypes.includes(file.type);

        if (!isImage && !isVideo) {
            return NextResponse.json({
                error: 'Invalid file type. Only images (JPEG, PNG, GIF, WebP) and videos (MP4, WebM, MOV) are allowed.'
            }, { status: 400 });
        }

        // Verify scene exists and belongs to user
        const scene = await prisma.scene.findFirst({
            where: {
                id: sceneId,
                project: {
                    user_id: session.user.id
                }
            },
            include: {
                project: true
            }
        });

        if (!scene) {
            return NextResponse.json({ error: 'Scene not found' }, { status: 404 });
        }

        // Convert file to buffer
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // Determine folder based on type
        const folder = isImage ? 'scenes/images' : 'scenes/videos';

        // Upload to R2
        const uploadedUrl = await uploadBufferToR2(buffer, file.type, folder);

        if (!uploadedUrl) {
            return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
        }

        // Update scene with new asset
        const updateData: any = {};

        if (isImage) {
            updateData.image_url = uploadedUrl;
            updateData.image_status = 'completed';
            updateData.media_type = 'image';
        } else if (isVideo) {
            updateData.video_url = uploadedUrl;
            updateData.video_status = 'completed';
            updateData.media_type = 'video';
        }

        const updatedScene = await prisma.scene.update({
            where: { id: sceneId },
            data: updateData
        });

        // Create asset index entry for cataloging and reuse
        await prisma.assetIndex.create({
            data: {
                source_scene_id: sceneId,
                source_project_id: scene.project_id,
                asset_type: isImage ? 'IMAGE' : 'VIDEO',
                url: uploadedUrl,
                description: scene.visual_description,
                tags: [], // Could extract from description with AI later
                category: null,
                duration_seconds: isVideo ? null : null, // Could be extracted from video metadata
                metadata: {
                    originalFileName: file.name,
                    mimeType: file.type,
                    uploadedAt: new Date().toISOString(),
                    uploadedBy: session.user.id,
                    fileSize: file.size
                }
            }
        });

        return NextResponse.json({
            success: true,
            url: uploadedUrl,
            type: isImage ? 'image' : 'video',
            scene: updatedScene
        });

    } catch (error: any) {
        console.error('Asset upload error:', error);
        return NextResponse.json(
            { error: error.message || 'Upload failed' },
            { status: 500 }
        );
    }
}
