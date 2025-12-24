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
        const validVideoTypes = [
            'video/mp4',
            'video/webm',
            'video/quicktime',  // .mov
            'video/x-msvideo',  // .avi
            'video/avi'         // alternative MIME for .avi
        ];

        const isImage = validImageTypes.includes(file.type);
        const isVideo = validVideoTypes.includes(file.type);

        console.log(`[Upload] File validation - Name: ${file.name}, Type: ${file.type}, Size: ${file.size} bytes`);
        console.log(`[Upload] Is Image: ${isImage}, Is Video: ${isVideo}`);

        if (!isImage && !isVideo) {
            console.error(`[Upload] Invalid file type rejected: ${file.type}`);
            return NextResponse.json({
                error: `Invalid file type. Only images (JPEG, PNG, GIF, WebP) and videos (MP4, WebM, MOV, AVI) are allowed. Received: ${file.type}`
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
        let buffer = Buffer.from(new Uint8Array(bytes));

        // Auto-crop images to 9:16 aspect ratio to prevent squishing
        // (Videos will be cropped during final render)
        if (isImage) {
            try {
                console.log('[Upload] Starting image crop for', file.name);
                const { cropImageTo9x16 } = await import('@/lib/utils/asset-crop');
                const originalSize = buffer.length;
                const croppedBuffer = await cropImageTo9x16(buffer);
                buffer = Buffer.from(croppedBuffer);  // Garantir tipo correto
                console.log(`[Upload] Image cropped successfully. Original: ${originalSize}bytes, Cropped: ${buffer.length}bytes`);
            } catch (error: any) {
                console.error('[Upload] Image crop failed:', error.message);
                console.error('[Upload] Stack:', error.stack);
                // Continue with original buffer
            }
        }

        // Determine folder based on type
        const folder = isImage ? 'scenes/images' : 'scenes/videos';

        // Upload to R2
        console.log(`[Upload] Uploading ${isVideo ? 'video' : 'image'} to R2. Size: ${buffer.length} bytes, Type: ${file.type}`);
        const uploadedUrl = await uploadBufferToR2(buffer, file.type, folder);

        if (!uploadedUrl) {
            console.error('[Upload] R2 upload returned null/empty URL');
            return NextResponse.json({ error: 'Upload failed - no URL returned' }, { status: 500 });
        }

        console.log(`[Upload] Successfully uploaded to: ${uploadedUrl}`);

        // Update scene with new asset
        // IMPORTANT: We DO NOT delete the old asset because:
        // 1. It may be reused in other projects/scenes (asset library)
        // 2. Deleting it would break those references
        // 3. Orphaned assets should be cleaned up by a separate garbage collection process
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
        try {
            console.log(`[Upload] Creating asset index entry for ${isImage ? 'image' : 'video'}: ${uploadedUrl}`);
            const assetIndex = await prisma.assetIndex.create({
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
            console.log(`[Upload] Asset index entry created successfully. ID: ${assetIndex.id}`);
        } catch (assetIndexError: any) {
            // Log error but don't fail the upload if asset indexing fails
            console.error('[Upload] Failed to create asset index entry:', assetIndexError.message);
            console.error('[Upload] Asset will be available but not indexed for reuse');
        }

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
