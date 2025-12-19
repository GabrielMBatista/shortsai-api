import { prisma } from '../lib/prisma';
import { assetLibraryService } from '../lib/assets/asset-library-service';

async function syncAllAssets() {
    console.log('🚀 Iniciando Sincronização Total da Biblioteca de Assets...');

    // 1. Buscar todas as cenas concluídas que tenham algum asset
    const scenes = await prisma.scene.findMany({
        where: {
            OR: [
                { image_url: { not: null }, image_status: 'completed' },
                { audio_url: { not: null }, audio_status: 'completed' },
                { video_url: { not: null }, video_status: 'completed' }
            ],
            deleted_at: null
        },
        orderBy: { created_at: 'desc' }
    });

    console.log(`📊 Encontradas ${scenes.length} cenas candidatas para indexação.`);

    let syncedCount = 0;
    let skippedCount = 0;

    for (const scene of scenes) {
        // Tipos de asset para processar nesta cena
        const assetTypes = [];
        if (scene.image_url && scene.image_status === 'completed') assetTypes.push({ type: 'IMAGE', url: scene.image_url, desc: scene.visual_description });
        if (scene.audio_url && scene.audio_status === 'completed') assetTypes.push({ type: 'AUDIO', url: scene.audio_url, desc: scene.narration, metadata: { timings: scene.word_timings }, duration: Number(scene.duration_seconds) });
        if (scene.video_url && scene.video_status === 'completed') assetTypes.push({ type: 'VIDEO', url: scene.video_url, desc: scene.visual_description });

        for (const asset of assetTypes) {
            try {
                process.stdout.write(`🔄 Processando ${asset.type}... `);

                const result = await assetLibraryService.registerAsset({
                    source_scene_id: scene.id,
                    source_project_id: scene.project_id,
                    asset_type: asset.type as any,
                    url: asset.url!,
                    description: asset.desc,
                    duration_seconds: (asset as any).duration,
                    metadata: (asset as any).metadata
                });

                if (result) {
                    process.stdout.write('✅\n');
                    syncedCount++;
                } else {
                    process.stdout.write('⏭️ (já existia)\n');
                    skippedCount++;
                }
            } catch (err) {
                console.error(`\n❌ Erro ao indexar asset da cena ${scene.id}:`, err);
            }
        }
    }

    console.log('\n✨ Sincronização concluída!');
    console.log(`✅ Assets novos indexados: ${syncedCount}`);
    console.log(`⏭️ Assets pulados: ${skippedCount}`);
    console.log(`📚 Total na biblioteca agora: ${syncedCount + skippedCount}`);
}

syncAllAssets()
    .catch(err => {
        console.error('💥 Erro fatal no script de sincronia:', err);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
