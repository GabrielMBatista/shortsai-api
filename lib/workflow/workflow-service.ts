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
        }

        await prisma.project.update({
            where: { id: project.id },
            data: { status: 'generating' }
        });

        // Trigger the first available task
        await this.dispatchNext(project.id);

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
        const project = await prisma.project.findUnique({
            where: { id: projectId },
            include: { scenes: { orderBy: { scene_number: 'asc' } } }
        });

        if (!project || project.status !== 'generating') return null;

        // Simple Poller: Find first QUEUED task
        // We do NOT enforce sequence here. Sequence is enforced by dispatchNext queuing items one by one.
        // This allows "Regen" (manual queue) to be picked up immediately even if out of order.

        for (const scene of project.scenes) {
            if (scene.image_status === SceneStatus.queued) {
                // Lock it
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

            if (scene.audio_status === SceneStatus.queued) {
                // Lock it
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
        }

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

            // Trigger next step in sequence
            await this.dispatchNext(projectId);

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
            }
        }
    }

    // Smart Dispatcher: Enforces Sequence
    private static async dispatchNext(projectId: string) {
        const project = await prisma.project.findUnique({
            where: { id: projectId },
            include: { scenes: { orderBy: { scene_number: 'asc' } } }
        });

        if (!project || project.status !== 'generating') return;

        // Find the first asset that needs generation
        for (const scene of project.scenes) {
            // 1. Image
            if (scene.image_status === SceneStatus.pending) {
                await prisma.scene.update({
                    where: { id: scene.id },
                    data: { image_status: SceneStatus.queued }
                });
                return; // Only queue ONE thing at a time to enforce sequence
            }
            if (scene.image_status === SceneStatus.queued || scene.image_status === SceneStatus.processing || scene.image_status === SceneStatus.loading) {
                return; // Busy with this, wait.
            }
            if (scene.image_status === SceneStatus.failed) {
                return; // Blocked by failure
            }

            // 2. Audio (only after image is done? Or parallel? User said "Sequence scene by scene")
            // Let's assume Image -> Audio per scene.
            if (scene.audio_status === SceneStatus.pending) {
                await prisma.scene.update({
                    where: { id: scene.id },
                    data: { audio_status: SceneStatus.queued }
                });
                return;
            }
            if (scene.audio_status === SceneStatus.queued || scene.audio_status === SceneStatus.processing || scene.audio_status === SceneStatus.loading) {
                return;
            }
            if (scene.audio_status === SceneStatus.failed) {
                return;
            }

            // If both completed, move to next scene (loop continues)
        }

        // If we reach here, all scenes are completed (or failed/ignored).
        // Check if truly all completed
        const allDone = project.scenes.every(s =>
            s.image_status === SceneStatus.completed &&
            s.audio_status === SceneStatus.completed
        );

        if (allDone) {
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
        };
    }
}
