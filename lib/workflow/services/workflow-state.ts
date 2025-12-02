import { prisma } from '../../prisma';
import { Project, Scene, SceneStatus, MusicStatus } from '@prisma/client';
import { broadcastProjectUpdate } from '@/lib/sse/sse-service';

export class WorkflowStateService {

    static async getProjectWithScenes(projectId: string) {
        return prisma.project.findUnique({
            where: { id: projectId },
            include: { scenes: { where: { deleted_at: null }, orderBy: { scene_number: 'asc' } } }
        });
    }

    static async updateProjectStatus(projectId: string, status: string) {
        await prisma.project.update({
            where: { id: projectId },
            data: { status: status as any }
        });
        broadcastProjectUpdate(projectId, { type: 'project_status_update', status });
    }

    static async updateSceneStatus(projectId: string, sceneId: string, type: 'image' | 'audio' | 'video', status: SceneStatus, errorMessage?: string | null) {
        const field = `${type}_status` as keyof Scene;
        const data: any = { [field]: status };

        if (errorMessage !== undefined) {
            data.error_message = errorMessage;
        }

        await prisma.scene.update({
            where: { id: sceneId },
            data
        });
        broadcastProjectUpdate(projectId, { type: 'scene_update', sceneId, field: type, status });
    }

    static async updateMusicStatus(projectId: string, status: MusicStatus, url?: string) {
        const data: any = { bg_music_status: status };
        if (url) data.bg_music_url = url;

        await prisma.project.update({
            where: { id: projectId },
            data
        });

        const payload: any = { type: 'music_update', status };
        if (url) payload.url = url;

        broadcastProjectUpdate(projectId, payload);
    }

    static async resetSceneStatus(projectId: string, type: 'image' | 'audio' | 'video', force: boolean) {
        const field = `${type}_status` as keyof Scene;

        if (force) {
            await prisma.scene.updateMany({
                where: { project_id: projectId },
                data: {
                    [field]: SceneStatus.pending,
                    [`${type}_attempts`]: 0,
                    error_message: null
                }
            });
        } else {
            await prisma.scene.updateMany({
                where: {
                    project_id: projectId,
                    [field]: { in: [SceneStatus.draft, (SceneStatus as any).processing, SceneStatus.loading, SceneStatus.failed] }
                },
                data: { [field]: SceneStatus.pending }
            });
        }
    }

    static async broadcastFullState(projectId: string) {
        const project = await this.getProjectWithScenes(projectId);
        if (!project) return;

        const broadcastPayload = {
            type: 'init',
            projectStatus: project.status,
            scenes: project.scenes.map(s => ({
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
            bgMusicStatus: project.bg_music_status,
            bgMusicUrl: project.bg_music_url
        };
        broadcastProjectUpdate(projectId, broadcastPayload);
    }

    static async failAllPending(projectId: string) {
        const project = await this.getProjectWithScenes(projectId);
        if (!project) return;

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
            if (['processing', 'loading', 'queued', 'pending'].includes((scene as any).video_status)) {
                data.video_status = SceneStatus.failed;
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
}
