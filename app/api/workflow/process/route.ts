import { NextResponse } from 'next/server';
import { WorkflowService, WorkflowTask } from '@/lib/workflow/workflow-service';
import { AIService } from '@/lib/ai/ai-service';
import { prisma } from '@/lib/prisma';

export const maxDuration = 60; // Allow 60 seconds for generation
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const task: WorkflowTask = await request.json();

        if (!task || !task.id || !task.projectId) {
            return NextResponse.json({ error: 'Invalid task payload' }, { status: 400 });
        }

        console.log(`[Worker] Processing task ${task.id} (${task.action})`);

        // Get Project to get User ID (for API keys)
        const project = await prisma.project.findUnique({ where: { id: task.projectId } });
        if (!project) {
            throw new Error('Project not found');
        }

        let outputUrl: string | undefined;
        let timings: any[] | undefined;
        let duration: number | undefined;
        let reusedAsset: any = null;

        // Check Limits
        const limitType = task.action === 'generate_image' ? 'image' :
            (task.action === 'generate_audio' ? 'audio' :
                (task.action === 'generate_video' ? 'video' : null));

        if (limitType) {
            const { checkLimits } = await import('@/lib/ai/core/usage-tracker');
            const allowed = await checkLimits(project.user_id, limitType as any);
            if (!allowed) {
                throw new Error(`Quota exceeded for ${limitType}. Please upgrade your plan.`);
            }
        }

        const { assetLibraryService } = await import('@/lib/assets/asset-library-service');
        const reuseStrategy = (project as any).asset_reuse_strategy || 'auto_reuse';

        try {
            if (reuseStrategy === 'auto_reuse') {
                let searchDesc = task.action === 'generate_audio' ? (task.params as any).text : (task.params as any).prompt;
                const searchType = task.action === 'generate_image' ? 'IMAGE' : (task.action === 'generate_audio' ? 'AUDIO' : (task.action === 'generate_video' ? 'VIDEO' : null));

                // Fallback para descrição da cena se o prompt estiver vazio
                if (!searchDesc && task.sceneId) {
                    const scene = await prisma.scene.findUnique({ where: { id: task.sceneId } });
                    searchDesc = scene?.visual_description;
                }

                if (searchDesc && searchType) {
                    console.log(`[Worker] Checking library for ${searchType} match: "${searchDesc.substring(0, 50)}..."`);

                    // Configurar limiares baseados na prioridade (Vídeo > Imagem > Áudio)
                    let minSimilarity = 0.80;
                    if (searchType === 'VIDEO') minSimilarity = 0.75;
                    if (searchType === 'AUDIO') minSimilarity = 0.98;

                    const matches = await assetLibraryService.findCompatibleAssets({
                        description: searchDesc,
                        assetType: searchType as any,
                        channelId: project.channel_id || undefined,
                        minSimilarity
                    });

                    if (matches.length > 0) {
                        let bestMatch = matches[0];

                        // AUTO-PROMOÇÃO: Se o match veio da busca profunda em cenas, indexar agora
                        if ((bestMatch as any).from_index === false) {
                            console.log(`[Worker] Promoting legacy asset from project database to AssetIndex...`);
                            const registered = await assetLibraryService.registerAsset({
                                source_scene_id: (bestMatch as any).source_scene?.id,
                                source_project_id: (bestMatch as any).source_scene?.project_id,
                                asset_type: searchType as any,
                                url: bestMatch.url,
                                description: bestMatch.description,
                                duration_seconds: bestMatch.duration_seconds,
                                metadata: bestMatch.metadata
                            });

                            if (registered) {
                                // Atualizar o objeto para usar o novo ID do índice e permitir o tracking
                                bestMatch = { ...bestMatch, id: registered.id };
                            }
                        }

                        console.log(`[Worker] Match Found! Reusing ${searchType} (Similarity: ${bestMatch.similarity.toFixed(2)}) ID: ${bestMatch.id}`);
                        outputUrl = bestMatch.url;
                        reusedAsset = bestMatch;

                        // Restaurar metadados técnicos (timings, duration)
                        if (searchType === 'AUDIO' && bestMatch.metadata) {
                            timings = (bestMatch.metadata as any).timings;
                            duration = bestMatch.duration_seconds || undefined;
                            console.log(`[Worker] Restored technical metadata for audio reuse.`);
                        }

                        // Atualizar tracking de uso (Agora garantido que o ID existe no AssetIndex)
                        await assetLibraryService.trackAssetReuse(bestMatch.id, project.channel_id || undefined);
                    } else {
                        console.log(`[Worker] No compatible ${searchType} found in library or project history.`);
                    }
                }
            }

            // Se não houve reuso, gerar normalmente
            if (!outputUrl) {
                switch (task.action) {
                    case 'generate_image':
                        if ('prompt' in task.params) {
                            outputUrl = await AIService.generateImage(
                                project.user_id,
                                task.params.prompt,
                                project.style,
                                task.apiKeys
                            );
                        }
                        break;
                    case 'generate_audio':
                        if ('text' in task.params) {
                            const result = await AIService.generateAudio(
                                project.user_id,
                                task.params.text,
                                task.params.voice,
                                task.params.provider,
                                task.apiKeys,
                                project.audio_model || undefined
                            );
                            outputUrl = result.url;
                            timings = result.timings;
                            duration = result.duration;
                        }
                        break;
                    case 'generate_music':
                        if ('prompt' in task.params) {
                            outputUrl = await AIService.generateMusic(
                                project.user_id,
                                task.params.prompt,
                                task.apiKeys
                            );
                        }
                        break;
                    case 'generate_video':
                        if (task.sceneId) {
                            const scene = await prisma.scene.findUnique({ where: { id: task.sceneId } });
                            if (scene && scene.image_url) {
                                const params = task.params as any;
                                outputUrl = await AIService.generateVideo(
                                    project.user_id,
                                    scene.image_url,
                                    'prompt' in task.params ? task.params.prompt : '',
                                    task.apiKeys,
                                    params.model || 'veo-2.0-generate-001',
                                    params.with_audio || false
                                );
                            } else {
                                throw new Error("Scene image not found for video generation");
                            }
                        }
                        break;
                    default:
                        throw new Error(`Unknown action ${task.action}`);
                }

                // Indexar o novo asset gerado para reuso futuro
                if (outputUrl && task.sceneId) {
                    const registerType = task.action === 'generate_image' ? 'IMAGE' : (task.action === 'generate_audio' ? 'AUDIO' : (task.action === 'generate_video' ? 'VIDEO' : null));
                    if (registerType) {
                        await assetLibraryService.registerAsset({
                            source_scene_id: task.sceneId,
                            source_project_id: task.projectId,
                            asset_type: registerType as any,
                            url: outputUrl,
                            description: task.action === 'generate_audio' ? (task.params as any).text : (task.params as any).prompt,
                            duration_seconds: duration,
                            metadata: timings ? { timings } : null
                        });
                    }
                }
            }

            // Complete Task
            await WorkflowService.completeTask(
                task.projectId,
                task.sceneId!,
                task.action === 'generate_image' ? 'image' : (task.action === 'generate_music' ? 'music' : (task.action === 'generate_video' ? 'video' : 'audio')),
                'completed',
                outputUrl,
                undefined,
                task.apiKeys,
                timings,
                duration
            );

            return NextResponse.json({ success: true, url: outputUrl, reused: !!reusedAsset });

        } catch (error: any) {
            console.error(`[Worker] Task failed: ${error.message}`);

            await WorkflowService.completeTask(
                task.projectId,
                task.sceneId!,
                task.action === 'generate_image' ? 'image' : (task.action === 'generate_music' ? 'music' : (task.action === 'generate_video' ? 'video' : 'audio')),
                'failed',
                undefined,
                error.message,
                task.apiKeys
            );

            // Return 200 even on error so WorkflowEngine doesn't think the HTTP call failed and trigger another failure logic
            return NextResponse.json({ success: false, error: error.message }, { status: 200 });
        }

    } catch (error: any) {
        console.error('[Worker] System Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
