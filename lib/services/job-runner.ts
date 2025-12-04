import { prisma } from "@/lib/prisma";
import { VideoService } from "@/lib/ai/services/video-service";

export async function createVideoJob(sceneId: string, projectId: string, payload: any) {
    // 1. Cria o registro da intenção
    const job = await prisma.job.create({
        data: {
            type: "VIDEO_GENERATION",
            status: "QUEUED",
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
            data: { status: "PROCESSING" }
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
        const videoUrl = await VideoService.generateVideo(
            userId,
            imageUrl,
            prompt,
            keys,
            modelId,
            withAudio
        );
        // -------------------------------------

        // Transação Atômica: Atualiza Job E Cena juntos
        await prisma.$transaction(async (tx) => {
            // Finaliza Job
            await tx.job.update({
                where: { id: jobId },
                data: {
                    status: "COMPLETED",
                    outputResult: { videoUrl }
                }
            });

            // Atualiza Cena com Lock Otimista
            if (job.sceneId) {
                await tx.scene.update({
                    where: { id: job.sceneId },
                    data: {
                        video_url: videoUrl,
                        video_status: "completed", // Update existing enum status
                        status: "READY",           // Update new string status
                        version: { increment: 1 },
                        media_type: "video"        // Auto-switch to video
                    }
                });
            }
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
                status: "FAILED",
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
                        video_status: "failed",
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
