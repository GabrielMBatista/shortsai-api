import { prisma } from '../../prisma';
import { Project, Scene, SceneStatus, MusicStatus, Prisma } from '@prisma/client';
import { broadcastProjectUpdate } from '@/lib/sse/sse-service';

const projectWithScenes = Prisma.validator<Prisma.ProjectDefaultArgs>()({
    include: {
        scenes: { include: { characters: true } },
        ProjectCharacters: { include: { characters: true } }
    }
});

type ProjectWithScenes = Prisma.ProjectGetPayload<typeof projectWithScenes>;

export class WorkflowStateService {

    static async getProjectWithScenes(projectId: string): Promise<ProjectWithScenes | null> {
        return prisma.project.findUnique({
            where: { id: projectId },
            include: {
                scenes: { where: { deleted_at: null }, orderBy: { scene_number: 'asc' }, include: { characters: true } },
                ProjectCharacters: { include: { characters: true } }
            }
        });
    }

    static async updateProjectStatus(projectId: string, status: string) {
        await prisma.project.update({
            where: { id: projectId },
            data: { status: status as any }
        });
        broadcastProjectUpdate(projectId, { type: 'project_status_update', status });
    }

    static async updateSceneStatus(projectId: string, sceneId: string, type: 'image' | 'audio' | 'video', status: SceneStatus, errorMessage?: string | null, payload?: any) {
        const field = `${type}_status` as keyof Scene;
        const data: any = { [field]: status };

        if (errorMessage !== undefined) {
            data.error_message = errorMessage;
        }

        // If payload contains DB fields like duration or timings, update them too
        if (payload) {
            // Prevent video generation from overwriting audio duration
            if (payload.duration && type !== 'video') data.duration_seconds = payload.duration;
            if (payload.timings) data.word_timings = payload.timings;
            // Note: URLs are usually updated separately or passed here if we want to update DB too.
            // But WorkflowEngine updates DB manually for URLs currently. 
            // Let's keep DB update minimal here to avoid conflicts, or we can move DB update here too.
            // For now, let's trust the caller handles DB for complex fields if needed, 
            // or we can add them to 'data' if they match schema.
            if (payload.url) {
                data[`${type}_url`] = payload.url;
            }
        }

        // Auto-switch media type to video if video generation completes
        if (type === 'video' && status === SceneStatus.completed) {
            data.media_type = 'video';
        }

        await prisma.scene.update({
            where: { id: sceneId },
            data
        });

        // Broadcast with full payload
        const broadcastData = {
            type: 'scene_update',
            sceneId,
            field: type,
            status,
            error: errorMessage, // Send error explicitly
            mediaType: data.media_type, // Broadcast media type change
            ...payload // Merge extra fields like url, timings, duration
        };

        broadcastProjectUpdate(projectId, broadcastData);
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
                    [field]: { in: [SceneStatus.draft, SceneStatus.processing, SceneStatus.loading, SceneStatus.failed] }
                },
                data: { [field]: SceneStatus.pending }
            });
        }
    }

    static async broadcastFullState(projectId: string) {
        const project = await this.getProjectWithScenes(projectId);
        if (!project) return;

        // Re-evaluate project status to ensure it's up to date with scenes
        const isProcessing = project.scenes.some(s =>
            s.image_status === 'processing' || s.image_status === 'loading' || s.image_status === 'queued' || s.image_status === 'pending' ||
            s.audio_status === 'processing' || s.audio_status === 'loading' || s.audio_status === 'queued' || s.audio_status === 'pending' ||
            s.video_status === 'processing' || s.video_status === 'loading' || s.video_status === 'queued' ||
            project.bg_music_status === 'loading' || project.bg_music_status === 'queued' || project.bg_music_status === 'pending'
        );

        const computedStatus = isProcessing ? 'generating' : (project.status === 'failed' ? 'failed' : 'completed');

        const broadcastPayload = {
            type: 'init',
            projectStatus: computedStatus,
            scenes: project.scenes.map(s => ({
                id: s.id,
                sceneNumber: s.scene_number,
                imageStatus: s.image_status,
                audioStatus: s.audio_status,
                sfxStatus: s.sfx_status,
                imageUrl: s.image_url,
                audioUrl: s.audio_url,
                sfxUrl: s.sfx_url,
                errorMessage: s.error_message,
                visualDescription: s.visual_description,
                narration: s.narration,
                durationSeconds: s.duration_seconds,
                videoStatus: s.video_status,
                videoUrl: s.video_url,
                mediaType: s.media_type,
                videoModel: s.video_model,
                wordTimings: s.word_timings,
                imageAttempts: s.image_attempts,
                audioAttempts: s.audio_attempts,
                sfxAttempts: s.sfx_attempts,
                videoAttempts: s.video_attempts,
                characters: (s as any).characters || []
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
