import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

/**
 * POST /api/assets/catalog/backfill
 * Cataloga todos os assets das cenas que ainda não estão no AssetIndex
 */
export async function POST(req: NextRequest) {
    try {
        console.log('[Backfill] Iniciando catalogação de assets faltantes...');

        // Buscar todas as cenas com suas URLs
        const scenes = await prisma.scene.findMany({
            select: {
                id: true,
                project_id: true,
                scene_number: true,
                visual_description: true,
                image_url: true,
                video_url: true,
                audio_url: true,
            },
        });

        console.log(`[Backfill] Encontradas ${scenes.length} cenas`);

        let created = 0;
        let skipped = 0;
        let errors = 0;

        for (const scene of scenes) {
            const urls = [
                { url: scene.image_url, type: 'IMAGE' as const },
                { url: scene.video_url, type: 'VIDEO' as const },
                { url: scene.audio_url, type: 'AUDIO' as const },
            ];

            for (const { url, type } of urls) {
                if (!url || !url.includes('r2.dev')) continue;

                try {
                    // Verificar se já existe
                    const existing = await prisma.assetIndex.findUnique({
                        where: { url },
                    });

                    if (existing) {
                        skipped++;
                        continue;
                    }

                    // Criar novo registro
                    await prisma.assetIndex.create({
                        data: {
                            source_scene_id: scene.id,
                            source_project_id: scene.project_id,
                            asset_type: type,
                            url: url,
                            description: scene.visual_description?.substring(0, 500) || '',
                            tags: [],
                            category: null,
                            duration_seconds: null,
                            quality_score: 0.5,
                            use_count: 1,
                            last_used_at: new Date(),
                            last_used_in_channel: null,
                            metadata: {
                                auto_cataloged: true,
                                backfilled_at: new Date().toISOString(),
                                scene_number: scene.scene_number,
                            },
                        },
                    });

                    created++;

                    if (created % 100 === 0) {
                        console.log(`[Backfill] Progresso: ${created} criados, ${skipped} já existentes`);
                    }
                } catch (error: any) {
                    errors++;
                    console.error(`[Backfill] Erro ao catalogar ${url}:`, error.message);
                }
            }
        }

        console.log('[Backfill] Catalogação concluída!');
        console.log(`  - Criados: ${created}`);
        console.log(`  - Já existentes: ${skipped}`);
        console.log(`  - Erros: ${errors}`);

        return NextResponse.json({
            success: true,
            created,
            skipped,
            errors,
            message: `Catalogação concluída! ${created} novos assets indexados.`,
        });
    } catch (error: any) {
        console.error('[Backfill] Erro fatal:', error);
        return NextResponse.json(
            { error: 'Falha na catalogação', details: error.message },
            { status: 500 }
        );
    }
}
