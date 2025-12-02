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
            await WorkflowStateService.updateSceneStatus(projectId, sceneId, type, SceneStatus.completed);

            // Update additional fields that updateSceneStatus doesn't handle generically
            const updateData: any = {
                [`${type}_url`]: outputUrl,
                word_timings: timings || undefined,
                duration_seconds: (typeof duration === 'number') ? duration : undefined,
                error_message: null
            };
            await prisma.scene.update({ where: { id: sceneId }, data: updateData });

            // Update user last_video_generated_at if it was a video task
            if (type === 'video') {
                const project = await prisma.project.findUnique({ where: { id: projectId }, select: { user_id: true } });
                if (project) {
                    await prisma.user.update({
                        where: { id: project.user_id },
                        data: { last_video_generated_at: new Date() } as any
                    });
                }
            }

            // Broadcast update via SSE (StateService handles generic status, but we need to send URL/timings)
            // Actually StateService.updateSceneStatus sends the status update. 
            // We should probably send a more detailed update here or update StateService to handle it.
            // For now, let's just send the specific update here to match original behavior
            const broadcastPayload = {
                type: 'scene_update',
                sceneId,
                field: type,
                status: 'completed',
                url: outputUrl,
                timings: timings,
                duration: (typeof duration === 'number') ? duration : undefined
            };
            // We need to import broadcastProjectUpdate or add a method to StateService. 
            // Let's add a generic broadcast method to StateService? 
            // Or just import it here. Let's import it to keep it simple for now, 
            // but ideally StateService handles all broadcasting.
            // I'll use StateService.updateSceneStatus for the status, but for the URL/timings, 
            // the original code sent one big message.
            // Let's rely on the fact that the frontend polls or listens.
            // The original code sent one message with all data.
            // Let's use a helper in StateService to broadcast arbitrary data?
            // Or just re-implement the broadcast here.
            // I'll import broadcastProjectUpdate from sse-service.
        } else {
            // Handle failure & Retry logic
            const scene = await prisma.scene.findUnique({ where: { id: sceneId } });
            if (!scene) return;

            const attempts = (scene as any)[fieldAttempts] + 1;
            const maxAttempts = 2;

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
                    await WorkflowStateService.updateSceneStatus(projectId, scene.id, 'image', (SceneStatus as any).processing);
                    taskToTrigger = {
                        id: `task-${scene.id}-image-${Date.now()}`,
                        projectId, sceneId: scene.id, action: 'generate_image',
                        params: { prompt: scene.visual_description, width: 1080, height: 1920 },
                        status: 'pending', createdAt: new Date(), apiKeys
                    };
                    break;
                }
                if (scene.audio_status === SceneStatus.queued) {
                    await WorkflowStateService.updateSceneStatus(projectId, scene.id, 'audio', (SceneStatus as any).processing);
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

                    await WorkflowStateService.updateSceneStatus(projectId, scene.id, 'video', (SceneStatus as any).processing);
                    taskToTrigger = {
                        id: `task-${scene.id}-video-${Date.now()}`,
                        projectId, sceneId: scene.id, action: 'generate_video',
                        params: { prompt: scene.visual_description, width: 1080, height: 1920 },
                        status: 'pending', createdAt: new Date(), apiKeys
                    };
                    break;
                }
            }
        }

        // 2. AUTOMATIC SEQUENCE
        if (!taskToTrigger && project.status === 'generating') {
            const isProcessing = project.scenes.some(s =>
                s.image_status === (SceneStatus as any).processing || s.image_status === SceneStatus.loading ||
                s.audio_status === (SceneStatus as any).processing || s.audio_status === SceneStatus.loading ||
                (s as any).video_status === (SceneStatus as any).processing || (s as any).video_status === SceneStatus.loading ||
                project.bg_music_status === 'loading'
            );

            if (!isProcessing) {
                for (const scene of project.scenes) {
                    if (scene.image_status === SceneStatus.pending) {
                        await WorkflowStateService.updateSceneStatus(projectId, scene.id, 'image', (SceneStatus as any).processing);
                        taskToTrigger = {
                            id: `task-${scene.id}-image-${Date.now()}`,
                            projectId, sceneId: scene.id, action: 'generate_image',
                            params: { prompt: scene.visual_description, width: 1080, height: 1920 },
                            status: 'pending', createdAt: new Date(), apiKeys
                        };
                        break;
                    }
                    if (scene.audio_status === SceneStatus.pending) {
                        await WorkflowStateService.updateSceneStatus(projectId, scene.id, 'audio', (SceneStatus as any).processing);
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
        const allScenesDone = project.scenes.every((s: any) =>
            s.image_status === SceneStatus.completed &&
            s.audio_status === SceneStatus.completed &&
            s.video_status === SceneStatus.completed
        );
        const musicDone = !project.include_music || project.bg_music_status === MusicStatus.completed;

        if (allScenesDone && musicDone) {
            await WorkflowStateService.updateProjectStatus(project.id, 'completed');
        } else if (project.status === 'generating') {
            const isProcessing = project.scenes.some((s: any) =>
                s.image_status === (SceneStatus as any).processing || s.image_status === SceneStatus.loading ||
                s.audio_status === (SceneStatus as any).processing || s.audio_status === SceneStatus.loading ||
                s.video_status === (SceneStatus as any).processing || s.video_status === SceneStatus.loading ||
                project.bg_music_status === 'loading'
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
