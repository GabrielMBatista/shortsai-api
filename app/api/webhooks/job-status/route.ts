
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
    try {
        const authHeader = req.headers.get('authorization');
        const workerSecret = process.env.WORKER_SECRET;

        if (workerSecret && authHeader !== `Bearer ${workerSecret}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { jobId, status, progress, resultUrl, error } = body;

        console.log(`[Webhook] Job ${jobId} update: ${status} ${progress}%`);

        if (!jobId) {
            return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
        }

        // Prepare update data
        const updateData: any = {};
        if (status) updateData.status = status;
        if (error) updateData.errorMessage = error;

        // Handle Output Result (JSON) merging
        // We want to preserve existing outputResult if possible, or overwrite.
        // For simplicity, we overwrite with whatever we have.
        // Ideally we fetch first, but that adds latency.
        // Let's just build the new object.
        const outputResult: any = {};
        if (typeof progress === 'number') outputResult.progress = progress;
        if (resultUrl) outputResult.url = resultUrl;

        // Check if we have any output data to save
        if (Object.keys(outputResult).length > 0) {
            // If we are just updating progress, we might overwrite 'url' if it was there?
            // Usually 'url' comes only at 'completed'. 
            // If 'completed', we have 'url'.
            // If 'processing', we have 'progress'.
            // Risk: a previous checkStatus might have seen 'url' (unlikely if order is strictly sequential).
            // Better safest approach: use JSON merge if we could, but map is easy.
            // We will store it.
            updateData.outputResult = outputResult;
        }

        await prisma.job.update({
            where: { id: jobId },
            data: updateData
        });

        // Propagate to Scene
        if (status === 'completed' || status === 'failed') {
            const job = await prisma.job.findUnique({
                where: { id: jobId },
                select: { sceneId: true }
            });

            if (job?.sceneId) {
                await prisma.scene.update({
                    where: { id: job.sceneId },
                    data: {
                        video_status: status === 'completed' ? 'completed' : 'failed',
                        video_url: resultUrl || undefined,
                        error_message: error || undefined
                    }
                });
            }
        }

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Webhook Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
