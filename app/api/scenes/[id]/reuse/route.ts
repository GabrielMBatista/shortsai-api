import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { assetLibraryService } from '@/lib/assets/asset-library-service';

export async function POST(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { assetUrl, assetId } = await req.json();

        if (!assetUrl) {
            return NextResponse.json({ error: 'Asset URL is required' }, { status: 400 });
        }

        const sceneId = params.id;

        // 1. Buscar a cena para saber o tipo de asset
        const scene = await prisma.scene.findUnique({
            where: { id: sceneId },
            include: { project: true }
        });

        if (!scene) {
            return NextResponse.json({ error: 'Scene not found' }, { status: 404 });
        }

        // 2. Atualizar a cena com o asset escolhido
        // Como o usuário escolheu manualmente, marcamos como completed
        const fieldUrl = scene.media_type === 'video' ? 'video_url' : 'image_url';
        const fieldStatus = scene.media_type === 'video' ? 'video_status' : 'image_status';

        const updatedScene = await prisma.scene.update({
            where: { id: sceneId },
            data: {
                [fieldUrl]: assetUrl,
                [fieldStatus]: 'completed',
                status: 'COMPLETED'
            }
        });

        // 3. Rastrear o uso se tivermos o ID do asset indexado
        if (assetId && !assetId.startsWith('scene-')) {
            await assetLibraryService.trackAssetReuse(assetId, scene.project.channel_id || undefined);
        }

        console.log(`[AssetReuse] User manually picked asset for scene ${sceneId}: ${assetUrl}`);

        return NextResponse.json({ success: true, scene: updatedScene });
    } catch (error) {
        console.error('[AssetReuse] Error applying asset:', error);
        return NextResponse.json({ error: 'Failed to apply asset' }, { status: 500 });
    }
}
