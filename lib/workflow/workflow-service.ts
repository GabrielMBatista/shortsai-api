import { prisma } from '../prisma';
import { Project, Scene, SceneStatus, MusicStatus } from '@prisma/client';
import { broadcastProjectUpdate } from '@/app/api/events/[projectId]/route';

export type WorkflowAction =
    | 'generate_all'
    | 'generate_image'
    | 'regenerate_image'
    | 'generate_audio'
    | 'regenerate_audio'
    | 'generate_music'
    | 'cancel'
    | 'pause'
    | 'resume'
    | 'skip_scene';

export interface WorkflowCommand {
    projectId: string;
    sceneId?: string;
    action: WorkflowAction;
    force?: boolean;
    apiKeys?: {
        gemini?: string;
        elevenlabs?: string;
        suno?: string;
    };
}

export type WorkflowTaskParams =
    | { prompt: string; width: number; height: number }
    | { text: string; voice: string; provider: string }
    | { prompt: string; duration: number }; // Music params example

export interface WorkflowTask {
    id: string; // Unique task ID
    projectId: string;
    sceneId?: string;
    action: 'generate_image' | 'generate_audio' | 'generate_music';
    params: WorkflowTaskParams;
    status: 'pending' | 'dispatched' | 'completed' | 'failed';
    createdAt: Date;
    apiKeys?: {
        gemini?: string;
        elevenlabs?: string;
        suno?: string;
    };
}

// In-memory task queue (for MVP/Vercel serverless limitations, this resets on cold start)
// In production, use Redis or Database. We will use Database for persistence.
// We'll add a 'Task' model to Prisma or just manage it via Scene status + polling.
// Given the constraints, we'll use a simple in-memory queue backed by DB status checks.
// Actually, user requested "Criar fila de tarefas". Let's use a simple array for now but
// rely on DB state to reconstruct it if needed.
// Better yet, let's make it stateless: PollTasks checks DB for "queued" items and returns them as tasks.

export class WorkflowService {

    static async handleCommand(command: WorkflowCommand) {
        const { projectId, sceneId, action, force, apiKeys } = command;

        const project = await prisma.project.findUnique({
            where: { id: projectId },
            include: { scenes: { orderBy: { scene_number: 'asc' } } }
        });

        if (!project) throw new Error('Project not found');

        switch (action) {
            case 'generate_all':
                return this.startGeneration(project, force, apiKeys);
            case 'generate_image':
            case 'regenerate_image':
                if (!sceneId) throw new Error('Scene ID required');
                return this.queueSceneAsset(projectId, sceneId, 'image', force, apiKeys);
            case 'generate_audio':
            case 'regenerate_audio':
                if (!sceneId) throw new Error('Scene ID required');
                return this.queueSceneAsset(projectId, sceneId, 'audio', force, apiKeys);
            case 'generate_music':
                return this.queueMusic(projectId, force, apiKeys);
            case 'cancel':
                return this.cancelGeneration(projectId);
            case 'pause':
                return this.pauseGeneration(projectId);
            case 'resume':
                return this.resumeGeneration(project);
            case 'skip_scene':
                if (!sceneId) throw new Error('Scene ID required');
                return this.skipScene(sceneId);
            default:
                throw new Error(`Action ${action} not implemented`);
        }
    }

    private static async startGeneration(project: Project & { scenes: Scene[] }, force?: boolean, apiKeys?: any) {
        // If force, reset all to pending
        if (force) {
            await prisma.scene.updateMany({
                where: { project_id: project.id },
                data: {
                    image_status: SceneStatus.pending,
                    audio_status: SceneStatus.pending,
                    image_attempts: 0,
                    audio_attempts: 0,
                    error_message: null
                }
            });

            if (project.include_music) {
                await prisma.project.update({
                    where: { id: project.id },
                    data: { bg_music_status: MusicStatus.pending }
                });
            }
        }

        await prisma.project.update({
            where: { id: project.id },
            data: { status: 'generating' }
        });

        // Trigger the first available task
        await this.dispatchNext(project.id, apiKeys);

        return { message: 'Generation started' };
    }

    private static async queueSceneAsset(projectId: string, sceneId: string, type: 'image' | 'audio', force?: boolean, apiKeys?: any) {
        const field = `${type}_status` as keyof Scene;
        const attemptsField = `${type}_attempts` as keyof Scene;

        const updates: any[] = [
            prisma.scene.update({
                where: { id: sceneId },
                data: {
                    [field]: SceneStatus.queued,
                    [attemptsField]: force ? 0 : undefined
                }
            }),
            prisma.project.update({
                where: { id: projectId },
                data: { status: 'generating' }
            })
        ];

        await prisma.$transaction(updates);

        // Trigger immediately
        await this.dispatchNext(projectId, apiKeys);

        return { message: `${type} queued` };
    }

    private static async queueMusic(projectId: string, force?: boolean, apiKeys?: any) {
        await prisma.project.update({
            where: { id: projectId },
            data: {
                bg_music_status: MusicStatus.queued,
                status: 'generating'
            }
        });

        await this.dispatchNext(projectId, apiKeys);
        return { message: 'Music queued' };
    }

    private static async cancelGeneration(projectId: string) {
        await prisma.project.update({
            where: { id: projectId },
            data: { status: 'failed' }
        });
        return { message: 'Generation cancelled' };
    }

    private static async pauseGeneration(projectId: string) {
        await prisma.project.update({
            where: { id: projectId },
            data: { status: 'paused' }
        });
        return { message: 'Generation paused' };
    }

    private static async resumeGeneration(project: any) {
        await prisma.project.update({
            where: { id: project.id },
            data: { status: 'generating' }
        });
        // Kickstart queue
        await this.dispatchNext(project.id);
        return { message: 'Generation resumed' };
    }

    private static async skipScene(sceneId: string) {
        const scene = await prisma.scene.update({
            where: { id: sceneId },
            data: {
                image_status: SceneStatus.completed,
                audio_status: SceneStatus.completed,
                error_message: 'Skipped by user'
            }
        });

        // Try to move to next
        await this.dispatchNext(scene.project_id);

        return { message: 'Scene skipped' };
    }

    // --- Task Polling Logic ---

    static async getNextTask(projectId: string): Promise<WorkflowTask | null> {
        // This method is legacy/polling based. dispatchNext handles the push.
        // But if we use a pull model, we can implement it here.
        // For now, we rely on dispatchNext pushing to the worker endpoint.
        return null;
    }

    static async completeTask(projectId: string, sceneId: string | undefined, type: 'image' | 'audio' | 'music', status: 'completed' | 'failed', outputUrl?: string, error?: string, apiKeys?: any) {

        if (type === 'music') {
            if (status === 'completed') {
                await prisma.project.update({
                    where: { id: projectId },
                    data: { bg_music_status: MusicStatus.completed, bg_music_url: outputUrl }
                });
                broadcastProjectUpdate(projectId, { type: 'music_update', status: 'completed', url: outputUrl });
            } else {
                await prisma.project.update({
                    where: { id: projectId },
                    data: { bg_music_status: MusicStatus.failed } // No retry logic for music yet
                });
            }
            await this.dispatchNext(projectId, apiKeys);
            return;
        }

        if (!sceneId) return; // Should not happen for image/audio

        const fieldStatus = `${type}_status`;
        const fieldUrl = `${type}_url`;
        const fieldAttempts = `${type}_attempts`;

        if (status === 'completed') {
            await prisma.scene.update({
                where: { id: sceneId },
                data: {
                    [fieldStatus]: SceneStatus.completed,
                    [fieldUrl]: outputUrl,
                    error_message: null
                }
            });

            // Broadcast update via SSE
            broadcastProjectUpdate(projectId, { type: 'scene_update', sceneId, field: type, status: 'completed', url: outputUrl });

            // Trigger next step in sequence
            await this.dispatchNext(projectId, apiKeys);

        } else {
            // Handle failure & Retry logic
            const scene = await prisma.scene.findUnique({ where: { id: sceneId } });
            if (!scene) return;

            const attempts = (scene as any)[fieldAttempts] + 1;
            const maxAttempts = 2;

            let newStatus: SceneStatus = SceneStatus.queued; // Retry by default
            if (attempts >= maxAttempts) {
                newStatus = SceneStatus.failed; // Give up
            }

            await prisma.scene.update({
                where: { id: sceneId },
                data: {
                    [fieldStatus]: newStatus,
                    [fieldAttempts]: attempts,
                    error_message: error
                }
            });

            if (newStatus === SceneStatus.failed) {
                // If failed, we might want to stop or continue?
                // For now, let's stop auto-dispatch. User needs to fix or skip.
                // Or we could auto-skip? No, better to pause.
                await prisma.project.update({
                    where: { id: projectId },
                    data: { status: 'failed' }
                });
            } else {
                // If retrying, trigger immediately
                await this.dispatchNext(projectId, apiKeys);
            }
        }
    }

    // Smart Dispatcher: Enforces Sequence & Triggers Worker
    private static async dispatchNext(projectId: string, apiKeys?: any) {
        const project = await prisma.project.findUnique({
            where: { id: projectId },
            include: { scenes: { orderBy: { scene_number: 'asc' } } }
        });

        if (!project || project.status !== 'generating') return;

        let taskToTrigger: WorkflowTask | null = null;

        // 1. PRIORITY: Check for QUEUED items (Manual Overrides or Retries)
        // These bypass the sequential check.

        // Check Music Queue
        if (project.bg_music_status === MusicStatus.queued) {
            await prisma.project.update({ where: { id: projectId }, data: { bg_music_status: MusicStatus.loading } }); // Use loading/processing
            taskToTrigger = {
                id: `task-${projectId}-music-${Date.now()}`,
                projectId,
                action: 'generate_music',
                params: { prompt: project.bg_music_prompt || "instrumental", duration: 30 }, // Duration is placeholder
                status: 'pending',
                createdAt: new Date(),
                apiKeys
            };
        }

        if (!taskToTrigger) {
            for (const scene of project.scenes) {
                if (scene.image_status === SceneStatus.queued) {
                    await prisma.scene.update({ where: { id: scene.id }, data: { image_status: SceneStatus.processing } });
                    taskToTrigger = {
                        id: `task-${scene.id}-image-${Date.now()}`,
                        projectId, sceneId: scene.id, action: 'generate_image',
                        params: { prompt: scene.visual_description, width: 1080, height: 1920 },
                        status: 'pending', createdAt: new Date(), apiKeys
                    };
                    break;
                }
                if (scene.audio_status === SceneStatus.queued) {
                    await prisma.scene.update({ where: { id: scene.id }, data: { audio_status: SceneStatus.processing } });
                    taskToTrigger = {
                        id: `task-${scene.id}-audio-${Date.now()}`,
                        projectId, sceneId: scene.id, action: 'generate_audio',
                        params: { text: scene.narration, voice: project.voice_name, provider: project.tts_provider },
                        status: 'pending', createdAt: new Date(), apiKeys
                    };
                    break;
                }
            }
        }

        // 2. AUTOMATIC SEQUENCE: If no manual tasks, find next PENDING
        if (!taskToTrigger) {
            // Check if anything is currently processing (Global Sequence Lock for Auto-Flow)
            // We allow manual tasks to run in parallel with auto tasks (if we wanted), 
            // but here we prioritize manual. If manual ran, we returned.
            // Now we check if we can run the next auto task.

            const isProcessing = project.scenes.some(s =>
                s.image_status === SceneStatus.processing || s.image_status === SceneStatus.loading ||
                s.audio_status === SceneStatus.processing || s.audio_status === SceneStatus.loading ||
                project.bg_music_status === 'loading'
            );

            if (!isProcessing) {
                // Find first pending
                for (const scene of project.scenes) {
                    if (scene.image_status === SceneStatus.pending) {
                        await prisma.scene.update({ where: { id: scene.id }, data: { image_status: SceneStatus.processing } });
                        taskToTrigger = {
                            id: `task-${scene.id}-image-${Date.now()}`,
                            projectId, sceneId: scene.id, action: 'generate_image',
                            params: { prompt: scene.visual_description, width: 1080, height: 1920 },
                            status: 'pending', createdAt: new Date(), apiKeys
                        };
                        break;
                    }
                    if (scene.audio_status === SceneStatus.pending) {
                        await prisma.scene.update({ where: { id: scene.id }, data: { audio_status: SceneStatus.processing } });
                        taskToTrigger = {
                            id: `task-${scene.id}-audio-${Date.now()}`,
                            projectId, sceneId: scene.id, action: 'generate_audio',
                            params: { text: scene.narration, voice: project.voice_name, provider: project.tts_provider },
                            status: 'pending', createdAt: new Date(), apiKeys
                        };
                        break;
                    }
                }

                // Check pending music if scenes are done? Or parallel?
                // Usually music is last or parallel. Let's make it parallel if we want, 
                // but for now let's stick to sequence: Images -> Audio -> Music?
                // Or just if music is pending and nothing else is processing.
                if (!taskToTrigger && project.include_music && project.bg_music_status === MusicStatus.pending) {
                    await prisma.project.update({ where: { id: projectId }, data: { bg_music_status: MusicStatus.loading } });
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
            // Trigger Worker via API (Fire and Forget)
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
            console.log(`[WorkflowService] Triggering worker for task ${taskToTrigger.id} at ${baseUrl}`);

            fetch(`${baseUrl}/api/workflow/process`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(taskToTrigger)
            }).catch(err => console.error('[WorkflowService] Failed to trigger worker:', err));

            return;
        }

        // If we reach here, all scenes are completed (or failed/ignored).
        // Check if truly all completed
        const allScenesDone = project.scenes.every(s =>
            s.image_status === SceneStatus.completed &&
            s.audio_status === SceneStatus.completed
        );
        const musicDone = !project.include_music || project.bg_music_status === MusicStatus.completed;

        if (allScenesDone && musicDone) {
            await prisma.project.update({
                where: { id: projectId },
                data: { status: 'completed' }
            });
        }
    }

    static async getState(projectId: string) {
        const project = await prisma.project.findUnique({
            where: { id: projectId },
            include: { scenes: { orderBy: { scene_number: 'asc' } } }
        });

        if (!project) return null;

        return {
            projectStatus: project.status,
            scenes: project.scenes.map(s => ({
                id: s.id,
                scene_number: s.scene_number,
                image_status: s.image_status,
                audio_status: s.audio_status,
                image_url: s.image_url,
                audio_url: s.audio_url,
                error: s.error_message,
                visual_description: s.visual_description,
                narration: s.narration
            })),
            music_status: project.bg_music_status,
            music_url: project.bg_music_url
        };
    }
}
