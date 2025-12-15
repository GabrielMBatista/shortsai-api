import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { scheduleQueue } from '@/lib/queues/schedule-queue';

export const dynamic = 'force-dynamic';

/**
 * GET /api/personas/jobs/[jobId]
 * Polls the status of a background schedule generation job
 */
export async function GET(
    request: Request,
    { params }: { params: Promise<{ jobId: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { jobId } = await params;

        // Get the job from BullMQ
        const job = await scheduleQueue.getJob(jobId);

        if (!job) {
            return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }

        // Verify job belongs to user
        if (job.data.userId !== session.user.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        // Get job state
        const state = await job.getState();
        const progress = job.progress || 0;

        // Return different responses based on job state
        switch (state) {
            case 'completed':
                const result = job.returnvalue;
                return NextResponse.json({
                    status: 'completed',
                    result: result
                });

            case 'failed':
                const failedReason = job.failedReason;
                return NextResponse.json({
                    status: 'failed',
                    error: failedReason || 'Job failed'
                });

            case 'active':
                return NextResponse.json({
                    status: 'processing',
                    progress: progress
                });

            case 'waiting':
            case 'delayed':
                return NextResponse.json({
                    status: 'pending',
                    message: 'Job is queued'
                });

            default:
                return NextResponse.json({
                    status: state,
                    message: 'Job status unknown'
                });
        }
    } catch (error: any) {
        console.error('[GET /api/personas/jobs/[jobId]] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to get job status' },
            { status: 500 }
        );
    }
}
