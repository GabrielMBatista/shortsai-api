import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { JobType, JobStatus } from '@/lib/constants/job-status';
import { RenderJobInput } from '@/lib/rendering/types';

/**
 * POST /api/render/create
 * Create a new video render job
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json() as RenderJobInput;

        // Validate input
        if (!body.projectId || !body.userId || !body.scenes || body.scenes.length === 0) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields' },
                { status: 400 }
            );
        }

        // Create render job
        const job = await prisma.job.create({
            data: {
                type: JobType.VIDEO_RENDER,
                status: JobStatus.QUEUED,
                projectId: body.projectId,
                inputPayload: body
            }
        });

        // Start processing (async)
        processRenderJob(job.id, body).catch(err =>
            console.error(`[Render Job ${job.id}] Failed:`, err)
        );

        return NextResponse.json({
            success: true,
            jobId: job.id,
            message: 'Render job created and queued'
        });

    } catch (error: any) {
        console.error('[API /render/create] Error:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}

/**
 * Process render job
 */
async function processRenderJob(jobId: string, input: RenderJobInput): Promise<void> {
    try {
        // Mark as processing
        await prisma.job.update({
            where: { id: jobId },
            data: { status: JobStatus.PROCESSING }
        });

        // Import renderer
        const { VideoRenderer } = await import('@/lib/rendering/video-renderer');

        // Create renderer with progress callback
        const renderer = new VideoRenderer(jobId, async (progress) => {
            // Broadcast progress via SSE
            const { broadcastProjectUpdate } = await import('@/lib/sse/sse-service');
            broadcastProjectUpdate(input.projectId, {
                type: 'render_progress',
                jobId,
                phase: progress.phase,
                progress: progress.progress,
                message: progress.message
            });
        });

        // Execute render
        const result = await renderer.render(input);

        if (result.success) {
            // Update job as completed
            await prisma.job.update({
                where: { id: jobId },
                data: {
                    status: JobStatus.COMPLETED,
                    outputResult: {
                        videoUrl: result.videoUrl,
                        duration: result.duration,
                        fileSize: result.fileSize
                    }
                }
            });

            // Update project with final video
            await prisma.project.update({
                where: { id: input.projectId },
                data: {
                    final_video_url: result.videoUrl
                }
            });

            // Broadcast completion
            const { broadcastProjectUpdate } = await import('@/lib/sse/sse-service');
            broadcastProjectUpdate(input.projectId, {
                type: 'render_complete',
                jobId,
                videoUrl: result.videoUrl,
                duration: result.duration,
                fileSize: result.fileSize
            });

        } else {
            // Job failed
            await prisma.job.update({
                where: { id: jobId },
                data: {
                    status: JobStatus.FAILED,
                    errorMessage: result.error || 'Unknown error'
                }
            });

            // Broadcast failure
            const { broadcastProjectUpdate } = await import('@/lib/sse/sse-service');
            broadcastProjectUpdate(input.projectId, {
                type: 'render_failed',
                jobId,
                error: result.error
            });
        }

    } catch (error: any) {
        console.error(`[Render Job ${jobId}] Error:`, error);

        // Mark job as failed
        await prisma.job.update({
            where: { id: jobId },
            data: {
                status: JobStatus.FAILED,
                errorMessage: error.message
            }
        });
    }
}
