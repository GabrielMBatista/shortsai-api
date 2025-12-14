
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { scheduleGenerationQueue } from '@/lib/queues';

export const dynamic = 'force-dynamic';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id: jobId } = await params;
        const job = await scheduleGenerationQueue.getJob(jobId);

        if (!job) {
            return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }

        const state = await job.getState();
        const progress = job.progress;

        let result = null;
        if (state === 'completed') {
            result = job.returnvalue?.result;
        } else if (state === 'failed') {
            result = { error: job.failedReason };
        }

        return NextResponse.json({
            id: job.id,
            state,
            progress,
            result
        });

    } catch (error: any) {
        console.error('[GET /api/jobs/schedule/[id]] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
