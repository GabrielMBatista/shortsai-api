import { prisma } from '../prisma';
import { Project, Scene, SceneStatus, MusicStatus } from '@prisma/client';
import { broadcastProjectUpdate } from '@/lib/sse/sse-service';

export type WorkflowAction =
    | 'generate_all'
    | 'generate_image'
    | 'generate_all_images'
    | 'regenerate_image'
    | 'generate_audio'
    | 'generate_all_audio'
    | 'regenerate_audio'
    | 'generate_music'
    | 'generate_video'
    | 'regenerate_video'
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
    action: 'generate_image' | 'generate_audio' | 'generate_music' | 'generate_video';
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
            include: { scenes: { where: { deleted_at: null }, orderBy: { scene_number: 'asc' } } }
        });

        if (!project) throw new Error('Project not found');

        switch (action) {
            case 'generate_all':
                return this.startGeneration(project, force, apiKeys);
            case 'generate_image':
            case 'regenerate_image':
                if (!sceneId) throw new Error('Scene ID required');
                return this.queueSceneAsset(projectId, sceneId, 'image', force, apiKeys);
            case 'generate_all_images':
                return this.generateAllImages(project, force, apiKeys);
            case 'generate_audio':
            case 'regenerate_audio':
                if (!sceneId) throw new Error('Scene ID required');
                return this.queueSceneAsset(projectId, sceneId, 'audio', force, apiKeys);
            case 'generate_all_audio':
                return this.generateAllAudio(project, force, apiKeys);
            case 'generate_video':
            case 'regenerate_video':
                if (!sceneId) throw new Error('Scene ID required');
                return this.queueSceneAsset(projectId, sceneId, 'video', force, apiKeys);
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
        } else {
            // If not forced, reset DRAFT, PROCESSING, LOADING, and FAILED items to pending
            // This ensures we unblock stuck tasks and retry failures
            await prisma.scene.updateMany({
                where: {
                    project_id: project.id,
                    image_status: { in: [SceneStatus.draft, SceneStatus.processing, SceneStatus.loading, SceneStatus.failed] }
                },
                data: { image_status: SceneStatus.pending }
            });
            await prisma.scene.updateMany({
                where: {
                    project_id: project.id,
                    audio_status: { in: [SceneStatus.draft, SceneStatus.processing, SceneStatus.loading, SceneStatus.failed] }
                },
                data: { audio_status: SceneStatus.pending }
            });

            if (project.include_music && (
                project.bg_music_status === MusicStatus.draft ||
                !project.bg_music_status ||
                project.bg_music_status === MusicStatus.loading ||
                project.bg_music_status === MusicStatus.failed
            )) {
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
        broadcastProjectUpdate(project.id, { type: 'project_status_update', status: 'generating' });

        // Re-fetch project to get updated scene statuses for broadcast
        const updatedProject = await prisma.project.findUnique({
            where: { id: project.id },
            include: { scenes: { orderBy: { scene_number: 'asc' } } }
        });

        if (updatedProject) {
            const broadcastPayload = {
                type: 'init',
                projectStatus: updatedProject.status,
                scenes: updatedProject.scenes.map(s => ({
                    id: s.id,
                    sceneNumber: s.scene_number,
                    imageStatus: s.image_status,
                    audioStatus: s.audio_status,
                    imageUrl: s.image_url,
                    audioUrl: s.audio_url,
                    errorMessage: s.error_message,
                    visualDescription: s.visual_description,
                    narration: s.narration,
                    durationSeconds: s.duration_seconds,
                    videoStatus: (s as any).video_status,
                    videoUrl: (s as any).video_url,
                    mediaType: (s as any).media_type
                })),
                bgMusicStatus: updatedProject.bg_music_status,
                bgMusicUrl: updatedProject.bg_music_url
            };
            broadcastProjectUpdate(project.id, broadcastPayload);
        }

        // Trigger the first available task
        await this.dispatchNext(project.id, apiKeys);

        return { message: 'Generation started' };
    }

    private static async generateAllImages(project: Project, force?: boolean, apiKeys?: any) {
        if (force) {
            await prisma.scene.updateMany({
                where: { project_id: project.id },
                data: {
                    image_status: SceneStatus.pending,
                    image_attempts: 0,
                    error_message: null
                }
            });
        } else {
            await prisma.scene.updateMany({
                where: {
                    project_id: project.id,
                    image_status: { in: [SceneStatus.draft, SceneStatus.processing, SceneStatus.loading, SceneStatus.failed] }
                },
                data: { image_status: SceneStatus.pending }
            });
        }

        await prisma.project.update({
            where: { id: project.id },
            data: { status: 'generating' }
        });
        broadcastProjectUpdate(project.id, { type: 'project_status_update', status: 'generating' });

        const updatedProject = await prisma.project.findUnique({
            where: { id: project.id },
            include: { scenes: { orderBy: { scene_number: 'asc' } } }
        });

        if (updatedProject) {
            const broadcastPayload = {
                type: 'init',
                projectStatus: updatedProject.status,
                scenes: updatedProject.scenes.map(s => ({
                    id: s.id,
                    sceneNumber: s.scene_number,
                    imageStatus: s.image_status,
                    audioStatus: s.audio_status,
                    imageUrl: s.image_url,
                    audioUrl: s.audio_url,
                    errorMessage: s.error_message,
                    visualDescription: s.visual_description,
                    narration: s.narration,
                    durationSeconds: s.duration_seconds,
                    videoStatus: (s as any).video_status,
                    videoUrl: (s as any).video_url,
                    mediaType: (s as any).media_type
                })),
                bgMusicStatus: updatedProject.bg_music_status,
                bgMusicUrl: updatedProject.bg_music_url
            };
            broadcastProjectUpdate(project.id, broadcastPayload);
        }

        await this.dispatchNext(project.id, apiKeys);
        return { message: 'Image generation started' };
    }

    private static async generateAllAudio(project: Project, force?: boolean, apiKeys?: any) {
        if (force) {
            await prisma.scene.updateMany({
                where: { project_id: project.id },
                data: {
                    audio_status: SceneStatus.pending,
                    audio_attempts: 0,
                    error_message: null
                }
            });
        } else {
            await prisma.scene.updateMany({
                where: {
                    project_id: project.id,
                    audio_status: { in: [SceneStatus.draft, SceneStatus.processing, SceneStatus.loading, SceneStatus.failed] }
                },
                data: { audio_status: SceneStatus.pending }
            });
        }

        await prisma.project.update({
            where: { id: project.id },
            data: { status: 'generating' }
        });
        broadcastProjectUpdate(project.id, { type: 'project_status_update', status: 'generating' });

        const updatedProject = await prisma.project.findUnique({
            where: { id: project.id },
            include: { scenes: { orderBy: { scene_number: 'asc' } } }
        });

        if (updatedProject) {
            const broadcastPayload = {
                type: 'init',
                projectStatus: updatedProject.status,
                scenes: updatedProject.scenes.map(s => ({
                    id: s.id,
                    sceneNumber: s.scene_number,
                    imageStatus: s.image_status,
                    audioStatus: s.audio_status,
                    imageUrl: s.image_url,
                    audioUrl: s.audio_url,
                    errorMessage: s.error_message,
                    visualDescription: s.visual_description,
                    narration: s.narration,
                    durationSeconds: s.duration_seconds,
                    videoStatus: (s as any).video_status,
                    videoUrl: (s as any).video_url,
                    mediaType: (s as any).media_type
                })),
                bgMusicStatus: updatedProject.bg_music_status,
                bgMusicUrl: updatedProject.bg_music_url
            };
            broadcastProjectUpdate(project.id, broadcastPayload);
        }

        await this.dispatchNext(project.id, apiKeys);
        return { message: 'Audio generation started' };
    }

    private static async queueSceneAsset(projectId: string, sceneId: string, type: 'image' | 'audio' | 'video', force?: boolean, apiKeys?: any) {
        const field = `${type}_status` as keyof Scene;
        const attemptsField = `${type}_attempts` as keyof Scene;

        await prisma.scene.update({
            where: { id: sceneId },
            data: {
                [field]: SceneStatus.queued,
                [attemptsField]: force ? 0 : undefined
            }
        });
        broadcastProjectUpdate(projectId, { type: 'scene_update', sceneId, field: type, status: 'queued' });

        // Trigger immediately
        await this.dispatchNext(projectId, apiKeys);

        return { message: `${type} queued` };
    }

    private static async queueMusic(projectId: string, force?: boolean, apiKeys?: any) {
        await prisma.project.update({
            where: { id: projectId },
            data: {
                bg_music_status: MusicStatus.queued
            }
        });
        broadcastProjectUpdate(projectId, { type: 'music_update', status: 'queued' });

        await this.dispatchNext(projectId, apiKeys);
        return { message: 'Music queued' };
    }

    private static async cancelGeneration(projectId: string) {
        // Update project status to failed
        await prisma.project.update({
            where: { id: projectId },
            data: { status: 'failed' }
        });

        // Also mark any processing/loading/queued/pending scenes as failed so they stop spinning
        await prisma.scene.updateMany({
            where: {
                project_id: projectId,
                OR: [
                    { image_status: { in: [SceneStatus.processing, SceneStatus.loading, SceneStatus.queued, SceneStatus.pending] } },
                    { audio_status: { in: [SceneStatus.processing, SceneStatus.loading, SceneStatus.queued, SceneStatus.pending] } }
                ]
            },
            data: {
                // We can't easily update both fields conditionally in one query without raw SQL or multiple queries.
                // For simplicity, let's just set the project to failed and let the user retry.
                // But to stop spinners, we need to update the specific status fields.
                // Let's use updateMany for each status type if needed, or just rely on the project status?
                // The frontend checks scene status for spinners.
                // So we MUST update scene statuses.
            }
        });

        // Since we can't conditionally update fields in updateMany easily (e.g. set image_status=failed ONLY if it was processing),
        // we might need to iterate or use raw query.
        // For now, let's just broadcast the project failure. The frontend SHOULD stop spinners if project is failed?
        // If the frontend logic is `isImageLoading = ...`, it depends on scene status.
        // Let's explicitly fail the active tasks.

        const project = await prisma.project.findUnique({
            where: { id: projectId },
            include: { scenes: true }
        });

        if (project) {
            for (const scene of project.scenes) {
                let updated = false;
                const data: any = {};
                if (['processing', 'loading', 'queued', 'pending'].includes(scene.image_status)) {
                    data.image_status = SceneStatus.failed;
                    updated = true;
                }
                if (['processing', 'loading', 'queued', 'pending'].includes(scene.audio_status)) {
                    data.audio_status = SceneStatus.failed;
                    updated = true;
                }
                if (updated) {
                    await prisma.scene.update({ where: { id: scene.id }, data });
                }
            }
            if (['processing', 'loading', 'queued', 'pending'].includes(project.bg_music_status || '')) {
                await prisma.project.update({ where: { id: projectId }, data: { bg_music_status: MusicStatus.failed } });
            }
        }

        broadcastProjectUpdate(projectId, { type: 'project_status_update', status: 'failed' });
        // We should also broadcast scene updates so individual spinners stop immediately
        // But a full state refresh or project status update might be enough if frontend handles it.
        // Let's send a full init/state update to be sure.
        const updatedProject = await prisma.project.findUnique({
            where: { id: projectId },
            include: { scenes: { orderBy: { scene_number: 'asc' } } }
        });
        if (updatedProject) {
            const broadcastPayload = {
                type: 'init',
                projectStatus: updatedProject.status,
                scenes: updatedProject.scenes.map(s => ({
                    id: s.id,
                    sceneNumber: s.scene_number,
                    imageStatus: s.image_status,
                    audioStatus: s.audio_status,
                    imageUrl: s.image_url,
                    audioUrl: s.audio_url,
                    errorMessage: s.error_message,
                    visualDescription: s.visual_description,
                    narration: s.narration,
                    durationSeconds: s.duration_seconds,
                    videoStatus: (s as any).video_status,
                    videoUrl: (s as any).video_url,
                    mediaType: (s as any).media_type
                })),
                bgMusicStatus: updatedProject.bg_music_status,
                bgMusicUrl: updatedProject.bg_music_url
            };
            broadcastProjectUpdate(projectId, broadcastPayload);
        }

        return { message: 'Generation cancelled' };
    }



    private static async pauseGeneration(projectId: string) {
        await prisma.project.update({
            where: { id: projectId },
            data: { status: 'paused' }
        });
        broadcastProjectUpdate(projectId, { type: 'project_status_update', status: 'paused' });
        return { message: 'Generation paused' };
    }

    private static async resumeGeneration(project: any) {
        await prisma.project.update({
            where: { id: project.id },
            data: { status: 'generating' }
        });
        broadcastProjectUpdate(project.id, { type: 'project_status_update', status: 'generating' });
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

    // --- Task Polling Logic ---

    static async getNextTask(projectId: string): Promise<WorkflowTask | null> {
        // This method is legacy/polling based. dispatchNext handles the push.
        return null;
    }

    static async completeTask(projectId: string, sceneId: string | undefined, type: 'image' | 'audio' | 'music' | 'video', status: 'completed' | 'failed', outputUrl?: string, error?: string, apiKeys?: any, timings?: any[], duration?: number) {
        if (type === 'audio') {
            console.log(`[WorkflowService] Completing audio task for scene ${sceneId}. Duration: ${duration}`);
        }

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
                    word_timings: timings || undefined,
                    duration_seconds: (typeof duration === 'number') ? duration : undefined,
                    error_message: null
                }
            });

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

            // Broadcast update via SSE
            broadcastProjectUpdate(projectId, {
                type: 'scene_update',
                sceneId,
                field: type,
                status: 'completed',
                url: outputUrl,
                timings: timings,
                duration: (typeof duration === 'number') ? duration : undefined
            });

            // Trigger next step in sequence
            await this.dispatchNext(projectId, apiKeys);

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
                error.includes("Rate limit exceeded") || // Optional: maybe retry rate limits with longer backoff? For now fail to stop loop.
                error.includes("Quota hit") ||
                error.includes("Model Refusal")
            );

            if (attempts >= maxAttempts || isFatalError) {
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
                await prisma.project.update({
                    where: { id: projectId },
                    data: { status: 'failed' }
                });
                broadcastProjectUpdate(projectId, { type: 'project_status_update', status: 'failed' });
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
            include: { scenes: { where: { deleted_at: null }, orderBy: { scene_number: 'asc' } } }
        });

        if (!project) return;

        let taskToTrigger: WorkflowTask | null = null;
        let rateLimitDelay: number | null = null;

        // 1. PRIORITY: Check for QUEUED items (Manual Overrides or Retries)
        // Check Music Queue
        if (project.bg_music_status === MusicStatus.queued) {
            await prisma.project.update({ where: { id: projectId }, data: { bg_music_status: MusicStatus.loading } });
            broadcastProjectUpdate(projectId, { type: 'music_update', status: 'loading' });
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
                    await prisma.scene.update({ where: { id: scene.id }, data: { image_status: SceneStatus.processing } });
                    broadcastProjectUpdate(projectId, { type: 'scene_update', sceneId: scene.id, field: 'image', status: 'processing' });
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
                    broadcastProjectUpdate(projectId, { type: 'scene_update', sceneId: scene.id, field: 'audio', status: 'processing' });
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
                        console.log(`[WorkflowService] Rate limit hit for user ${project.user_id}. Waiting ${waitTime}ms`);
                        if (rateLimitDelay === null || waitTime < rateLimitDelay) {
                            rateLimitDelay = waitTime;
                        }
                        continue; // Skip this video, look for others
                    }

                    await prisma.scene.update({ where: { id: scene.id }, data: { video_status: SceneStatus.processing } as any });
                    broadcastProjectUpdate(projectId, { type: 'scene_update', sceneId: scene.id, field: 'video', status: 'processing' });
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

        // 2. AUTOMATIC SEQUENCE: If no manual tasks, find next PENDING
        if (!taskToTrigger && project.status === 'generating') {
            const isProcessing = project.scenes.some(s =>
                s.image_status === SceneStatus.processing || s.image_status === SceneStatus.loading ||
                s.audio_status === SceneStatus.processing || s.audio_status === SceneStatus.loading ||
                (s as any).video_status === SceneStatus.processing || (s as any).video_status === SceneStatus.loading ||
                project.bg_music_status === 'loading'
            );

            if (!isProcessing) {
                for (const scene of project.scenes) {
                    if (scene.image_status === SceneStatus.pending) {
                        await prisma.scene.update({ where: { id: scene.id }, data: { image_status: SceneStatus.processing } });
                        broadcastProjectUpdate(projectId, { type: 'scene_update', sceneId: scene.id, field: 'image', status: 'processing' });
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
                        broadcastProjectUpdate(projectId, { type: 'scene_update', sceneId: scene.id, field: 'audio', status: 'processing' });
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
                    await prisma.project.update({ where: { id: projectId }, data: { bg_music_status: MusicStatus.loading } });
                    broadcastProjectUpdate(projectId, { type: 'music_update', status: 'loading' });
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
            console.log(`[WorkflowService] Triggering worker for task ${taskToTrigger.id} at ${baseUrl}`);

            fetch(`${baseUrl}/api/workflow/process`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(taskToTrigger)
            }).catch(err => console.error('[WorkflowService] Failed to trigger worker:', err));

            return;
        }

        // If no task triggered, but we had a rate limit skip, schedule retry
        if (rateLimitDelay !== null) {
            console.log(`[WorkflowService] Scheduling retry in ${rateLimitDelay}ms`);
            setTimeout(() => {
                this.dispatchNext(projectId, apiKeys);
            }, rateLimitDelay + 1000);
            return;
        }

        // Check completion
        const allScenesDone = project.scenes.every(s =>
            s.image_status === SceneStatus.completed &&
            s.audio_status === SceneStatus.completed &&
            (s as any).video_status === SceneStatus.completed
        );
        const musicDone = !project.include_music || project.bg_music_status === MusicStatus.completed;

        if (allScenesDone && musicDone) {
            await prisma.project.update({
                where: { id: projectId },
                data: { status: 'completed' }
            });
            broadcastProjectUpdate(projectId, { type: 'project_status_update', status: 'completed' });
        } else if (project.status === 'generating') {
            const isProcessing = project.scenes.some(s =>
                s.image_status === SceneStatus.processing || s.image_status === SceneStatus.loading ||
                s.audio_status === SceneStatus.processing || s.audio_status === SceneStatus.loading ||
                (s as any).video_status === SceneStatus.processing || (s as any).video_status === SceneStatus.loading ||
                project.bg_music_status === 'loading'
            );

            if (!isProcessing) {
                const hasFailures = project.scenes.some(s =>
                    s.image_status === SceneStatus.failed || s.audio_status === SceneStatus.failed || (s as any).video_status === SceneStatus.failed
                ) || (project.include_music && project.bg_music_status === MusicStatus.failed);

                if (hasFailures) {
                    await prisma.project.update({
                        where: { id: projectId },
                        data: { status: 'failed' }
                    });
                    broadcastProjectUpdate(projectId, { type: 'project_status_update', status: 'failed' });
                } else {
                    await prisma.project.update({
                        where: { id: projectId },
                        data: { status: 'completed' }
                    });
                    broadcastProjectUpdate(projectId, { type: 'project_status_update', status: 'completed' });
                }
            }
        }
    }

    static async getState(projectId: string) {
        const project = await prisma.project.findUnique({
            where: { id: projectId },
            include: { scenes: { where: { deleted_at: null }, orderBy: { scene_number: 'asc' } } }
        });

        if (!project) return null;

        let generationMessage = '';
        if (project.status === 'generating') {
            const processingScene = project.scenes.find(s =>
                s.image_status === SceneStatus.processing ||
                s.image_status === SceneStatus.loading ||
                s.audio_status === SceneStatus.processing ||
                s.audio_status === SceneStatus.loading ||
                (s as any).video_status === SceneStatus.processing ||
                (s as any).video_status === SceneStatus.loading
            );

            if (processingScene) {
                if (processingScene.image_status === SceneStatus.processing || processingScene.image_status === SceneStatus.loading) {
                    generationMessage = `Generating Image for Scene ${processingScene.scene_number}...`;
                } else if (processingScene.audio_status === SceneStatus.processing || processingScene.audio_status === SceneStatus.loading) {
                    generationMessage = `Generating Audio for Scene ${processingScene.scene_number}...`;
                } else {
                    generationMessage = `Generating Video for Scene ${processingScene.scene_number}...`;
                }
            } else if (project.bg_music_status === MusicStatus.loading) {
                generationMessage = "Generating Background Music...";
            }
        }

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
                narration: s.narration,
                wordTimings: s.word_timings,
                video_status: (s as any).video_status,
                video_url: (s as any).video_url,
                media_type: (s as any).media_type
            })),
            music_status: project.bg_music_status,
            music_url: project.bg_music_url,
            generationMessage
        };
    }
}
