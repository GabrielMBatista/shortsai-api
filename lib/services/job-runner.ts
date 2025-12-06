import { prisma } from "@/lib/prisma";
import { VideoService } from "@/lib/ai/services/video-service";
import { JobStatus, JobType, SceneStatus } from "@/lib/constants/job-status";

export async function createVideoJob(sceneId: string, projectId: string, payload: any) {
    // 1. Cria o registro da intenção
    const job = await prisma.job.create({
        data: {
            type: JobType.VIDEO_GENERATION,
            status: JobStatus.QUEUED,
            sceneId,
            projectId,
            inputPayload: payload
        }
    });

    // 2. Dispara o processamento em background (FIRE AND FORGET)
    processJob(job.id).catch(err => console.error("Job failed silently:", err));

    return job;
}

async function processJob(jobId: string) {
    try {
        // Marca como processando
        await prisma.job.update({
            where: { id: jobId },
            data: { status: JobStatus.PROCESSING }
        });

        const job = await prisma.job.findUnique({ where: { id: jobId } });
        if (!job) return;

        // --- SUA LÓGICA PESADA ANTIGA AQUI ---
        console.log('[Job Runner] Processing job with payload:', JSON.stringify(job.inputPayload, null, 2));
        let { userId, imageUrl, prompt, keys, modelId, withAudio } = job.inputPayload as any;

        // If imageUrl is missing (e.g. removed to avoid 413), fetch from Scene
        if (!imageUrl && job.sceneId) {
            const scene = await prisma.scene.findUnique({ where: { id: job.sceneId } });
            if (scene?.image_url) {
                imageUrl = scene.image_url;
            } else {
                throw new Error("Image URL not found for scene");
            }
        }

        // Call the existing VideoService
        // Call the existing VideoService
        let videoUrl = await VideoService.generateVideo(
            userId,
            imageUrl,
            prompt,
            keys,
            modelId,
            withAudio
        );
        
        // Upload to R2 to avoid saving Base64 in DB
        try {
            const { uploadBase64ToR2 } = await import("@/lib/storage");
            if (videoUrl.startsWith('data:')) {
                console.log('[Job Runner] Uploading generated video to R2...');
                const r2Url = await uploadBase64ToR2(videoUrl, 'scenes/videos');
                if (r2Url) {
                    console.log('[Job Runner] Video uploaded to:', r2Url);
                    videoUrl = r2Url;
                }
            }
        } catch (error) {
            console.error('[Job Runner] Failed to upload video to R2:', error);
            // Continue with base64 if upload fails, or throw? 
            // Better to keep base64 than lose data, but DB might reject if too large.
            // Let's proceed, as the user emphasized "recovering" (reading), but saving is also important.
        }
        // -------------------------------------

        // Transação Atômica: Atualiza Job E Cena juntos
        // Timeout increased to 10 minutes to handle long video generation
        await prisma.$transaction(async (tx) => {
            // Finaliza Job
            await tx.job.update({
                where: { id: jobId },
                data: {
                    status: JobStatus.COMPLETED,
                    outputResult: { videoUrl }
                }
            });

            // Atualiza Cena com Lock Otimista
            if (job.sceneId) {
                await tx.scene.update({
                    where: { id: job.sceneId },
                    data: {
                        video_url: videoUrl,
                        video_status: SceneStatus.COMPLETED,
                        status: "READY",           // Update new string status
                        version: { increment: 1 },
                        media_type: "video"        // Auto-switch to video
                    }
                });
            }
        }, {
            timeout: 600000 // 10 minutes timeout for video generation
        });

        // Broadcast update via SSE
        if (job.sceneId && job.projectId) {
            const { broadcastProjectUpdate } = await import("@/lib/sse/sse-service");
            broadcastProjectUpdate(job.projectId, {
                type: 'scene_update',
                sceneId: job.sceneId,
                field: 'video',
                status: 'completed',
                url: videoUrl,
                mediaType: 'video'
            });
        }

    } catch (error: any) {
        console.error(`Erro no Job ${jobId}:`, error);
        await prisma.job.update({
            where: { id: jobId },
            data: {
                status: JobStatus.FAILED,
                errorMessage: error.message || "Unknown error"
            }
        });

        // Update scene to ERROR state
        const failedJob = await prisma.job.findUnique({ where: { id: jobId } });
        if (failedJob?.sceneId) {
            try {
                await prisma.scene.update({
                    where: { id: failedJob.sceneId },
                    data: {
                        status: "FAILED",
                        video_status: SceneStatus.FAILED,
                        error_message: error.message || "Unknown error"
                    }
                });

                if (failedJob.projectId) {
                    const { broadcastProjectUpdate } = await import("@/lib/sse/sse-service");
                    broadcastProjectUpdate(failedJob.projectId, {
                        type: 'scene_update',
                        sceneId: failedJob.sceneId,
                        field: 'video',
                        status: 'failed',
                        error: error.message || "Unknown error"
                    });
                }
            } catch (e) {
                console.error("Failed to update scene status to FAILED", e);
            }
        }
    }
}
