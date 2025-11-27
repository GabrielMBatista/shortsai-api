import { prisma } from '@/lib/prisma';
import { SceneStatus, ProjectStatus, Project, Scene } from '@prisma/client';

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
        const { projectId, sceneId, action, force } = command;

        const project = await prisma.project.findUnique({
            where: { id: projectId },
            include: { scenes: { orderBy: { scene_number: 'asc' } } }
        });

        if (!project) throw new Error('Project not found');

        switch (action) {
            case 'generate_all':
                return this.startGeneration(project, force);
            case 'generate_image':
            case 'regenerate_image':
                if (!sceneId) throw new Error('Scene ID required');
                return this.queueSceneAsset(projectId, sceneId, 'image', force);
            case 'generate_audio':
            case 'regenerate_audio':
                if (!sceneId) throw new Error('Scene ID required');
                return this.queueSceneAsset(projectId, sceneId, 'audio', force);
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

    private static async startGeneration(project: Project & { scenes: Scene[] }, force?: boolean) {
        await prisma.project.update({
            where: { id: project.id },
            data: { status: 'generating' }
        });

        const updates: any[] = [];
        for (const scene of project.scenes) {
            if (scene.image_status === SceneStatus.pending || (force && scene.image_status === SceneStatus.completed)) {
                updates.push(prisma.scene.update({
                    where: { id: scene.id },
                    data: { image_status: SceneStatus.queued, image_attempts: 0 }
                }));
            }
            if (scene.audio_status === SceneStatus.pending || (force && scene.audio_status === SceneStatus.completed)) {
                updates.push(prisma.scene.update({
                    where: { id: scene.id },
                    data: { audio_status: SceneStatus.queued, audio_attempts: 0 }
                }));
            }
        }

        await prisma.$transaction(updates);
        return { message: 'Generation started' };
    }

    private static async queueSceneAsset(projectId: string, sceneId: string, type: 'image' | 'audio', force?: boolean) {
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
        return { message: `${type} queued` };
    }

    private static async cancelGeneration(projectId: string) {
        await prisma.project.update({
            where: { id: projectId },
            data: { status: 'failed' }
        });
        // In a real queue, we would clear tasks. Here, 'failed' status stops the poller from picking them up.
        return { message: 'Generation cancelled' };
    }

    private static async pauseGeneration(projectId: string) {
        await prisma.project.update({
            where: { id: projectId },
            data: { status: 'paused' } // Now supported in schema
        });
        return { message: 'Generation paused' };
    }

    private static async resumeGeneration(project: any) {
        await prisma.project.update({
            where: { id: project.id },
            data: { status: 'generating' }
        });
        return { message: 'Generation resumed' };
    }

    private static async skipScene(sceneId: string) {
        // Mark scene assets as completed or skipped? User said "marca cena como skipped".
        // We don't have 'skipped' enum. We'll use 'completed' for now or 'failed'?
        // 'failed' might trigger retry. 'completed' is safer for flow advancement.
        // Or we add 'skipped' to enum?
        // Let's use 'completed' but maybe add a note in error_message "Skipped by user".
        await prisma.scene.update({
            where: { id: sceneId },
            data: {
                image_status: SceneStatus.completed,
                audio_status: SceneStatus.completed,
                error_message: 'Skipped by user'
            }
        });
        return { message: 'Scene skipped' };
    }

    // --- Task Polling Logic ---

    static async getNextTask(projectId: string): Promise<WorkflowTask | null> {
        const project = await prisma.project.findUnique({
            where: { id: projectId },
            include: { scenes: { orderBy: { scene_number: 'asc' } } }
        });

        if (!project || project.status !== 'generating') return null;

        // Priority: Image -> Audio -> Next Scene
        // Concurrency: 1 scene at a time (strict serial)

        for (const scene of project.scenes) {
            // If this scene is processing, skip it (wait for it to finish) but check others
            if (scene.image_status === SceneStatus.processing || scene.audio_status === SceneStatus.processing) {
                continue;
            }

            // If image queued, return image task
            if (scene.image_status === SceneStatus.queued) {
                // Mark as processing immediately to prevent double dispatch
                await prisma.scene.update({
                    where: { id: scene.id },
                    data: { image_status: SceneStatus.processing }
                });

                return {
                    id: `task-${scene.id}-image-${Date.now()}`,
                    projectId,
                    sceneId: scene.id,
                    action: 'generate_image',
                    params: {
                        prompt: scene.visual_description,
                        width: 1080,
                        height: 1920
                    },
                    status: 'pending',
                    createdAt: new Date()
                };
            }

            // If image done but audio queued, return audio task
            if (scene.image_status === SceneStatus.completed && scene.audio_status === SceneStatus.queued) {
                await prisma.scene.update({
                    where: { id: scene.id },
                    data: { audio_status: SceneStatus.processing }
                });

                return {
                    id: `task-${scene.id}-audio-${Date.now()}`,
                    projectId,
                    sceneId: scene.id,
                    action: 'generate_audio',
                    params: {
                        text: scene.narration,
                        voice: project.voice_name,
                        provider: project.tts_provider
                    },
                    status: 'pending',
                    createdAt: new Date()
                };
            }

            // Continue to next scene (allow parallel/out-of-order execution)
        }

        // If all scenes done, check music
        // TODO: Music logic

        // If everything done, mark project completed
        await prisma.project.update({
            where: { id: projectId },
            data: { status: 'completed' }
        });

        return null;
    }

    static async completeTask(projectId: string, sceneId: string, type: 'image' | 'audio' | 'music', status: 'completed' | 'failed', outputUrl?: string, error?: string) {
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
            // Add queue info if needed
        };
    }
}
