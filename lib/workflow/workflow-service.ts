import { prisma } from '../prisma';
import { Project, Scene, SceneStatus, MusicStatus } from '@prisma/client';
import { WorkflowStateService } from './services/workflow-state';
import { WorkflowEngine } from './services/workflow-engine';
import { WorkflowCommand, WorkflowTask } from './types';
import { createVideoJob } from '../services/job-runner';

export * from './types';

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
                const scene = project.scenes.find(s => s.id === sceneId);
                if (!scene) throw new Error('Scene not found');

                await createVideoJob(sceneId, projectId, {
                    userId: project.user_id,
                    imageUrl: scene.image_url,
                    prompt: scene.visual_description,
                    keys: apiKeys,
                    modelId: (project as any).video_model || 'veo-2.0-generate-001',
                    withAudio: false
                });
                return { message: 'Video generation started (Async)' };
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
        // Reset statuses
        if (force) {
            await WorkflowStateService.resetSceneStatus(project.id, 'image', true);
            await WorkflowStateService.resetSceneStatus(project.id, 'audio', true);
            if (project.include_music) {
                await WorkflowStateService.updateMusicStatus(project.id, MusicStatus.pending);
            }
        } else {
            await WorkflowStateService.resetSceneStatus(project.id, 'image', false);
            await WorkflowStateService.resetSceneStatus(project.id, 'audio', false);

            if (project.include_music && (
                project.bg_music_status === MusicStatus.draft ||
                !project.bg_music_status ||
                project.bg_music_status === MusicStatus.loading ||
                project.bg_music_status === MusicStatus.failed
            )) {
                await WorkflowStateService.updateMusicStatus(project.id, MusicStatus.pending);
            }
        }

        await WorkflowStateService.updateProjectStatus(project.id, 'generating');

        // Broadcast full state
        await WorkflowStateService.broadcastFullState(project.id);

        // Trigger the first available task
        await WorkflowEngine.dispatchNext(project.id, apiKeys);

        return { message: 'Generation started' };
    }

    private static async generateAllImages(project: Project, force?: boolean, apiKeys?: any) {
        await WorkflowStateService.resetSceneStatus(project.id, 'image', !!force);
        await WorkflowStateService.updateProjectStatus(project.id, 'generating');
        await WorkflowStateService.broadcastFullState(project.id);
        await WorkflowEngine.dispatchNext(project.id, apiKeys);
        return { message: 'Image generation started' };
    }

    private static async generateAllAudio(project: Project, force?: boolean, apiKeys?: any) {
        await WorkflowStateService.resetSceneStatus(project.id, 'audio', !!force);
        await WorkflowStateService.updateProjectStatus(project.id, 'generating');
        await WorkflowStateService.broadcastFullState(project.id);
        await WorkflowEngine.dispatchNext(project.id, apiKeys);
        return { message: 'Audio generation started' };
    }

    private static async queueSceneAsset(projectId: string, sceneId: string, type: 'image' | 'audio' | 'video', force?: boolean, apiKeys?: any) {
        await WorkflowStateService.updateSceneStatus(projectId, sceneId, type, SceneStatus.queued);

        // Reset attempts if forced
        if (force) {
            await prisma.scene.update({
                where: { id: sceneId },
                data: { [`${type}_attempts`]: 0 }
            });
        }

        // Trigger immediately
        await WorkflowEngine.dispatchNext(projectId, apiKeys);

        return { message: `${type} queued` };
    }

    private static async queueMusic(projectId: string, force?: boolean, apiKeys?: any) {
        await WorkflowStateService.updateMusicStatus(projectId, MusicStatus.queued);
        await WorkflowEngine.dispatchNext(projectId, apiKeys);
        return { message: 'Music queued' };
    }

    private static async cancelGeneration(projectId: string) {
        await WorkflowStateService.updateProjectStatus(projectId, 'failed');
        await WorkflowStateService.failAllPending(projectId);
        await WorkflowStateService.broadcastFullState(projectId);
        return { message: 'Generation cancelled' };
    }

    private static async pauseGeneration(projectId: string) {
        await WorkflowStateService.updateProjectStatus(projectId, 'paused');
        return { message: 'Generation paused' };
    }

    private static async resumeGeneration(project: any) {
        // Reset stuck tasks
        await WorkflowStateService.resetSceneStatus(project.id, 'image', false);
        await WorkflowStateService.resetSceneStatus(project.id, 'audio', false);
        // Video reset logic (custom since resetSceneStatus is generic)
        await prisma.scene.updateMany({
            where: {
                project_id: project.id,
                // @ts-ignore
                video_status: { in: [SceneStatus.processing, SceneStatus.loading] }
            },
            // @ts-ignore
            data: { video_status: SceneStatus.pending }
        });

        if (project.include_music && (project.bg_music_status === MusicStatus.pending || project.bg_music_status === MusicStatus.loading)) {
            await WorkflowStateService.updateMusicStatus(project.id, MusicStatus.pending);
        }

        await WorkflowStateService.updateProjectStatus(project.id, 'generating');
        await WorkflowEngine.dispatchNext(project.id);
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

        await WorkflowEngine.dispatchNext(scene.project_id);
        return { message: 'Scene skipped' };
    }



    static async completeTask(projectId: string, sceneId: string | undefined, type: 'image' | 'audio' | 'music' | 'video', status: 'completed' | 'failed', outputUrl?: string, error?: string, apiKeys?: any, timings?: any[], duration?: number) {
        return WorkflowEngine.completeTask(projectId, sceneId, type, status, outputUrl, error, apiKeys, timings, duration);
    }

    static async getState(projectId: string) {
        const project = await WorkflowStateService.getProjectWithScenes(projectId);
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
