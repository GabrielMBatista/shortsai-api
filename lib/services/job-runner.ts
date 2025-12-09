import { prisma } from "@/lib/prisma";
import { VideoService } from "@/lib/ai/services/video-service";
import { JobStatus, JobType, SceneStatus } from "@/lib/constants/job-status";

// --- Rate Limited Queue Implementation ---
// --- User-Isolated Rate Limited Queues ---
// Maps userId -> Queue of JobIDs
const userQueues = new Map<string, string[]>();
// Maps userId -> Execution Timestamps
const userTimestamps = new Map<string, number[]>();
// Maps userId -> Processing Flag
const processingFlags = new Map<string, boolean>();

const RATE_LIMIT_COUNT = 1;
const RATE_LIMIT_WINDOW_MS = 40 * 1000;

async function processUserQueue(userId: string) {
    if (processingFlags.get(userId)) return;
    processingFlags.set(userId, true);

    const queue = userQueues.get(userId) || [];
    const timestamps = userTimestamps.get(userId) || [];

    try {
        while (queue.length > 0) {
            const now = Date.now();

            // 1. Clean up old timestamps
            while (timestamps.length > 0 && timestamps[0] <= now - RATE_LIMIT_WINDOW_MS) {
                timestamps.shift();
            }

            // 2. Check slots
            if (timestamps.length < RATE_LIMIT_COUNT) {
                const jobId = queue.shift();
                if (jobId) {
                    timestamps.push(Date.now());
                    // Run job (async, don't block loop heavily)
                    processJob(jobId, userId).catch(err => console.error(`[Queue] Job ${jobId} failed:`, err));
                }
            } else {
                // 3. Wait
                const oldestTimestamp = timestamps[0];
                const waitTime = (oldestTimestamp + RATE_LIMIT_WINDOW_MS) - now + 100;

                if (waitTime > 0) {
                    // console.log(`[Queue ${userId}] Waiting ${Math.ceil(waitTime/1000)}s...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }
            }
        }
    } catch (e) {
        console.error(`[Queue] Error processing queue for ${userId}:`, e);
    } finally {
        processingFlags.set(userId, false);
        // Persist state updates back to map (arrays are ref but good practice)
        userTimestamps.set(userId, timestamps);
    }
}
// -----------------------------------------

export async function createVideoJob(sceneId: string, projectId: string, payload: any) {
    const job = await prisma.job.create({
        data: {
            type: JobType.VIDEO_GENERATION,
            status: JobStatus.QUEUED,
            sceneId,
            projectId,
            inputPayload: payload
        }
    });

    const userId = payload.userId || 'anonymous';

    // Add to user-specific queue
    if (!userQueues.has(userId)) userQueues.set(userId, []);
    userQueues.get(userId)?.push(job.id);

    console.log(`[Queue] Job ${job.id} added to queue for user ${userId}`);
    processUserQueue(userId);

    return job;
}

// Helper function defined last to handle hoisting usage above
async function processJob(jobId: string, userId: string) {
    try {
        // Marca como processando
        await prisma.job.update({
            where: { id: jobId },
            data: { status: JobStatus.PROCESSING }
        });

        const job = await prisma.job.findUnique({ where: { id: jobId } });
        if (!job) return;

        console.log('[Job Runner] Processing job with payload:', JSON.stringify(job.inputPayload, null, 2));
        let { imageUrl, prompt, keys, modelId, withAudio } = job.inputPayload as any;

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
        }

        // Transação Atômica: Atualiza Job E Cena juntos
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
                        status: "READY",
                        version: { increment: 1 },
                        media_type: "video"
                    }
                });
            }
        }, {
            timeout: 600000
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

        // --- Auto-Retry for Rate Limits (429) ---
        if (error.message && (error.message.includes('429') || error.message.includes('quota') || error.message.includes('Quota'))) {
            console.warn(`[Job Runner] Job ${jobId} hit Rate Limit (429). Re-queuing in 65s...`);

            // Reset to QUEUED in DB
            await prisma.job.update({
                where: { id: jobId },
                data: { status: JobStatus.QUEUED }
            });

            // Re-add to queue after delay
            setTimeout(() => {
                console.log(`[Job Runner] Retrying job ${jobId} now.`);
                const uQueue = userQueues.get(userId);
                if (uQueue) {
                    uQueue.unshift(jobId); // Priority
                    processUserQueue(userId);
                }
            }, 65000);

            return; // Don't fail the job
        }
        // ----------------------------------------

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
