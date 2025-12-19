import { prisma } from '../../prisma';
import { SceneStatus, MusicStatus } from '@prisma/client';
import { WorkflowStateService } from './workflow-state';
import { WorkflowTask } from '../types';

export class WorkflowEngine {

    static async completeTask(projectId: string, sceneId: string | undefined, type: 'image' | 'audio' | 'music' | 'video', status: 'completed' | 'failed', outputUrl?: string, error?: string, apiKeys?: any, timings?: any[], duration?: number) {
        if (type === 'audio') {
            console.log(`[WorkflowEngine] Completing audio task for scene ${sceneId}. Duration: ${duration}`);
        }

        if (type === 'music') {
            if (status === 'completed') {
                await WorkflowStateService.updateMusicStatus(projectId, MusicStatus.completed, outputUrl);
            } else {
                await WorkflowStateService.updateMusicStatus(projectId, MusicStatus.failed);
            }
            await this.dispatchNext(projectId, apiKeys);
            return;
        }

        if (!sceneId) return;

        const fieldAttempts = `${type}_attempts` as const;

        if (status === 'completed') {
            // Prepare payload for DB and Broadcast
            const payload: any = {
                url: outputUrl,
                timings: timings,
                duration: (typeof duration === 'number') ? duration : undefined
            };

            // Update Status + DB + Broadcast in one go
            await WorkflowStateService.updateSceneStatus(projectId, sceneId, type, SceneStatus.completed, null, payload);
        } else {
            // Handle failure & Retry logic
            const scene = await prisma.scene.findUnique({ where: { id: sceneId } });
            if (!scene) return;

            const attempts = (scene as any)[fieldAttempts] + 1;
            const maxAttempts = 3;

            let newStatus: SceneStatus = SceneStatus.queued; // Retry by default

            // Check for fatal errors that should NOT be retried
            const isFatalError = error && (
                error.includes("API Key missing") ||
                error.includes("Rate limit exceeded") ||
                error.includes("Quota hit") ||
                error.includes("Model Refusal")
            );

            if (attempts >= maxAttempts || isFatalError) {
                newStatus = SceneStatus.failed; // Give up
            }

            // Update attempts
            await prisma.scene.update({
                where: { id: sceneId },
                data: { [`${type}_attempts`]: attempts }
            });

            await WorkflowStateService.updateSceneStatus(projectId, sceneId, type, newStatus, error);

            if (newStatus === SceneStatus.failed) {
                await WorkflowStateService.updateProjectStatus(projectId, 'failed');
            } else {
                // If retrying, trigger immediately
                await this.dispatchNext(projectId, apiKeys);
            }
        }

        // If completed, trigger next
        if (status === 'completed') {
            await this.dispatchNext(projectId, apiKeys);
        }
    }

    static async dispatchNext(projectId: string, apiKeys?: any) {
        const project = await WorkflowStateService.getProjectWithScenes(projectId);
        if (!project) return;

        let taskToTrigger: WorkflowTask | null = null;
        let rateLimitDelay: number | null = null;

        // 1. PRIORITY: Check for QUEUED items
        if (project.bg_music_status === MusicStatus.queued) {
            await WorkflowStateService.updateMusicStatus(projectId, MusicStatus.loading);
            taskToTrigger = {
                id: `task-${projectId}-music-${Date.now()}`,
                projectId,
                action: 'generate_music',
                params: { prompt: project.bg_music_prompt || "instrumental", duration: 30 },
                status: 'pending',
                createdAt: new Date(),
                apiKeys
            };
        }

        if (!taskToTrigger) {
            for (const scene of project.scenes) {
                if (scene.image_status === SceneStatus.queued) {
                    await WorkflowStateService.updateSceneStatus(projectId, scene.id, 'image', SceneStatus.processing);

                    // Check for asset reuse
                    const assetReuseStrategy = (project as any).asset_reuse_strategy || 'no_reuse';
                    if (assetReuseStrategy === 'auto_reuse') {
                        console.log(`[WorkflowEngine] Auto-reuse enabled for scene ${scene.id}. Searching compatible assets...`);
                    }

                    let prompt = scene.visual_description;

                    // 1. Explicit Assignment (Strongest Rule - Supports Many)
                    const explicitChars = (scene as any).characters || [];

                    if (explicitChars.length > 0) {
                        const charDescriptions = explicitChars.map((c: any) => `(${c.name}: ${c.description})`).join(' ');
                        prompt = `Characters details: ${charDescriptions}. Scene: ${scene.visual_description}`;
                    }
                    // 2. Name Matching (Fallback)
                    else {
                        const projectChars = (project as any).ProjectCharacters?.map((pc: any) => pc.characters) || [];
                        const matchedChars = projectChars.filter((c: any) =>
                            c.name && scene.visual_description.toLowerCase().includes(c.name.toLowerCase())
                        );

                        if (matchedChars.length > 0) {
                            const charDescriptions = matchedChars.map((c: any) => `(${c.name}: ${c.description})`).join(' ');
                            prompt = `Characters details: ${charDescriptions}. Scene: ${scene.visual_description}`;
                        }
                    }

                    taskToTrigger = {
                        id: `task-${scene.id}-image-${Date.now()}`,
                        projectId, sceneId: scene.id, action: 'generate_image',
                        params: {
                            prompt,
                            width: 1080,
                            height: 1920
                        },
                        status: 'pending', createdAt: new Date(), apiKeys
                    };
                    break;
                }
                if (scene.audio_status === SceneStatus.queued) {
                    await WorkflowStateService.updateSceneStatus(projectId, scene.id, 'audio', SceneStatus.processing);
                    taskToTrigger = {
                        id: `task-${scene.id}-audio-${Date.now()}`,
                        projectId, sceneId: scene.id, action: 'generate_audio',
                        params: { text: scene.narration, voice: project.voice_name, provider: project.tts_provider },
                        status: 'pending', createdAt: new Date(), apiKeys
                    };
                    break;
                }
                if ((scene as any).video_status === SceneStatus.queued) {
                    // Check rate limit
                    const user = await prisma.user.findUnique({ where: { id: project.user_id } });
                    const lastGenerated = (user as any)?.last_video_generated_at;
                    const now = new Date();
                    const timeSinceLast = lastGenerated ? now.getTime() - lastGenerated.getTime() : Infinity;
                    const DELAY_MS = 40000; // 40 seconds

                    if (timeSinceLast < DELAY_MS) {
                        const waitTime = DELAY_MS - timeSinceLast;
                        console.log(`[WorkflowEngine] Rate limit hit for user ${project.user_id}. Waiting ${waitTime}ms`);
                        if (rateLimitDelay === null || waitTime < rateLimitDelay) {
                            rateLimitDelay = waitTime;
                        }
                        continue;
                    }

                    // Update timestamp BEFORE dispatching to prevent concurrent videos
                    await prisma.user.update({
                        where: { id: project.user_id },
                        data: { last_video_generated_at: new Date() } as any
                    });

                    await WorkflowStateService.updateSceneStatus(projectId, scene.id, 'video', SceneStatus.processing);
                    taskToTrigger = {
                        id: `task-${scene.id}-video-${Date.now()}`,
                        projectId, sceneId: scene.id, action: 'generate_video',
                        params: {
                            prompt: scene.visual_description,
                            width: 1080,
                            height: 1920,
                            model: (project as any).video_model || 'veo',
                            with_audio: false
                        },
                        status: 'pending', createdAt: new Date(), apiKeys
                    };
                    break;
                }
            }
        }

        // 2. AUTOMATIC SEQUENCE
        if (!taskToTrigger && project.status === 'generating') {
            const isProcessing = project.scenes.some((s: any) =>
                s.image_status === SceneStatus.processing || s.image_status === SceneStatus.loading ||
                s.audio_status === SceneStatus.processing || s.audio_status === SceneStatus.loading ||
                (s as any).video_status === SceneStatus.processing || (s as any).video_status === SceneStatus.loading ||
                project.bg_music_status === 'loading'
            );

            if (!isProcessing) {
                for (const scene of project.scenes) {
                    if (scene.image_status === SceneStatus.pending) {
                        await WorkflowStateService.updateSceneStatus(projectId, scene.id, 'image', SceneStatus.processing);
                        let prompt = scene.visual_description;

                        // 1. Explicit Assignment (Strongest Rule - Supports Many)
                        const explicitChars = (scene as any).characters || [];

                        if (explicitChars.length > 0) {
                            const charDescriptions = explicitChars.map((c: any) => `(${c.name}: ${c.description})`).join(' ');
                            prompt = `Characters details: ${charDescriptions}. Scene: ${scene.visual_description}`;
                        }
                        // 2. Name Matching (Fallback)
                        else {
                            const projectChars = (project as any).ProjectCharacters?.map((pc: any) => pc.characters) || [];
                            const matchedChars = projectChars.filter((c: any) =>
                                c.name && scene.visual_description.toLowerCase().includes(c.name.toLowerCase())
                            );

                            if (matchedChars.length > 0) {
                                const charDescriptions = matchedChars.map((c: any) => `(${c.name}: ${c.description})`).join(' ');
                                prompt = `Characters details: ${charDescriptions}. Scene: ${scene.visual_description}`;
                            }
                        }

                        taskToTrigger = {
                            id: `task-${scene.id}-image-${Date.now()}`,
                            projectId, sceneId: scene.id, action: 'generate_image',
                            params: {
                                prompt,
                                width: 1080,
                                height: 1920
                            },
                            status: 'pending', createdAt: new Date(), apiKeys
                        };
                        break;
                    }
                    if (scene.audio_status === SceneStatus.pending) {
                        await WorkflowStateService.updateSceneStatus(projectId, scene.id, 'audio', SceneStatus.processing);
                        taskToTrigger = {
                            id: `task-${scene.id}-audio-${Date.now()}`,
                            projectId, sceneId: scene.id, action: 'generate_audio',
                            params: { text: scene.narration, voice: project.voice_name, provider: project.tts_provider },
                            status: 'pending', createdAt: new Date(), apiKeys
                        };
                        break;
                    }
                }

                if (!taskToTrigger && project.include_music && project.bg_music_status === MusicStatus.pending) {
                    await WorkflowStateService.updateMusicStatus(projectId, MusicStatus.loading);
                    taskToTrigger = {
                        id: `task-${projectId}-music-${Date.now()}`,
                        projectId,
                        action: 'generate_music',
                        params: { prompt: project.bg_music_prompt || "instrumental", duration: 30 },
                        status: 'pending',
                        createdAt: new Date(),
                        apiKeys
                    };
                }
            }
        }

        if (taskToTrigger) {
            const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';
            console.log(`[WorkflowEngine] Triggering worker for task ${taskToTrigger.id} at ${baseUrl}`);

            fetch(`${baseUrl}/api/workflow/process`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(taskToTrigger)
            })
                .then(async (res) => {
                    if (!res.ok) {
                        const errorText = await res.text();
                        console.error(`[WorkflowEngine] Worker failed for task ${taskToTrigger!.id}: ${res.status} ${errorText}`);

                        let type = taskToTrigger!.action.replace('generate_', '').replace('regenerate_', '') as 'image' | 'audio' | 'music' | 'video';
                        if (!['image', 'audio', 'music', 'video'].includes(type)) {
                            type = 'audio';
                            console.warn(`[WorkflowEngine] Unknown task type inferred: ${type} from action ${taskToTrigger!.action}`);
                        }

                        await this.completeTask(
                            taskToTrigger!.projectId,
                            taskToTrigger!.sceneId,
                            type,
                            'failed',
                            undefined,
                            `Worker Error: ${errorText}`
                        );
                    }
                })
                .catch(async (err) => {
                    console.error('[WorkflowEngine] Failed to trigger worker:', err);
                    let type = taskToTrigger!.action.replace('generate_', '').replace('regenerate_', '') as 'image' | 'audio' | 'music' | 'video';
                    // Fallback if regex fails or action is unknown (though it shouldn't be)
                    if (!['image', 'audio', 'music', 'video'].includes(type)) {
                        type = 'audio'; // Default fallback, but log warning
                        console.warn(`[WorkflowEngine] Unknown task type inferred: ${type} from action ${taskToTrigger!.action}`);
                    }
                    await this.completeTask(
                        taskToTrigger!.projectId,
                        taskToTrigger!.sceneId,
                        type,
                        'failed',
                        undefined,
                        `Trigger Error: ${err.message}`
                    );
                });

            return;
        }

        // Rate limit retry
        if (rateLimitDelay !== null) {
            console.log(`[WorkflowEngine] Scheduling retry in ${rateLimitDelay}ms`);
            setTimeout(() => {
                this.dispatchNext(projectId, apiKeys);
            }, rateLimitDelay + 1000);
            return;
        }

        // Check completion
        this.checkProjectCompletion(project);
    }

    private static async checkProjectCompletion(project: any) {
        // Determinar se o projeto está gerando vídeos (não apenas imagens)
        const isGeneratingVideos = project.scenes.some((s: any) =>
            s.media_type === 'video' ||
            ['completed', 'processing', 'loading', 'queued', 'pending'].includes(s.video_status)
        );

        // Se está gerando vídeos, exigir video_status completed
        // Caso contrário, apenas image + audio
        const allScenesDone = project.scenes.every((s: any) => {
            const imageAndAudioDone =
                s.image_status === SceneStatus.completed &&
                s.audio_status === SceneStatus.completed;

            if (isGeneratingVideos) {
                return imageAndAudioDone && s.video_status === SceneStatus.completed;
            }
            return imageAndAudioDone;
        });

        const musicDone = !project.include_music || project.bg_music_status === MusicStatus.completed;

        if (allScenesDone && musicDone) {
            await WorkflowStateService.updateProjectStatus(project.id, 'completed');
        } else if (project.status === 'generating') {
            const isProcessing = project.scenes.some((s: any) =>
                ['processing', 'loading', 'queued', 'pending'].includes(s.image_status) ||
                ['processing', 'loading', 'queued', 'pending'].includes(s.audio_status) ||
                ['processing', 'loading', 'queued', 'pending'].includes(s.video_status) ||
                ['loading', 'queued', 'pending'].includes(project.bg_music_status)
            );

            if (!isProcessing) {
                const hasFailures = project.scenes.some((s: any) =>
                    s.image_status === SceneStatus.failed || s.audio_status === SceneStatus.failed || s.video_status === SceneStatus.failed
                ) || (project.include_music && project.bg_music_status === MusicStatus.failed);

                if (hasFailures) {
                    await WorkflowStateService.updateProjectStatus(project.id, 'failed');
                } else {
                    await WorkflowStateService.updateProjectStatus(project.id, 'completed');
                }
            }
        }
    }
}
