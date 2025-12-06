
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { projectId, scenes, bgMusicUrl } = body;

        if (!projectId || !scenes || !Array.isArray(scenes)) {
            return NextResponse.json({ error: 'Invalid payload: projectId and scenes array required' }, { status: 400 });
        }

        if (scenes.length === 0) {
            return NextResponse.json({ error: 'No scenes provided' }, { status: 400 });
        }

        // Create Job in DB
        const job = await prisma.job.create({
            data: {
                id: uuidv4(),
                type: 'render_video',
                status: 'pending',
                projectId,
                inputPayload: {
                    projectId,
                    scenes,
                    bgMusicUrl
                }
            }
        });

        // Worker Dispatch
        const workerUrl = process.env.CLOUD_RUN_URL || process.env.WORKER_URL || 'http://shortsai-worker:8080';
        const webhookSecret = process.env.WORKER_SECRET || 'dev-secret';

        // Construct Webhook URL associated with THIS API
        // In Cloud Run, we should use the public URL of the API.
        // On VPS, slightly tricky if we don't know our own public IP/Domain from internal env.
        // Usually NEXT_PUBLIC_APP_URL is set.
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const webhookUrl = `${appUrl}/api/webhooks/job-status`;

        console.log(`[Job ${job.id}] Dispatching to Worker: ${workerUrl}/render`);

        // Async Dispatch (Fire and Forget)
        fetch(`${workerUrl}/render`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                id: job.id,
                payload: {
                    projectId,
                    scenes,
                    bgMusicUrl
                },
                webhook_url: webhookUrl,
                webhook_token: webhookSecret
            })
        }).then(async (res) => {
            if (!res.ok) {
                const txt = await res.text();
                console.error(`[Job ${job.id}] Worker Dispatch Failed: ${res.status} ${txt}`);
                // Update status to failed?
                await prisma.job.update({
                    where: { id: job.id },
                    data: { status: 'failed', errorMessage: `Dispatch failed: ${res.statusText}` }
                });
            } else {
                console.log(`[Job ${job.id}] Worker accepted job.`);
                const data = await res.json();
                if (data.status === 'completed' || data.status === 'failed') {
                    // This block runs if the worker finishes *synchronously* (unlikely for long jobs unless timeout logic handles it)
                    // or if the implementation awaits.
                    // But we are in a .then() callback of a non-awaited promise (from client perspective).
                    // So this updates DB eventually.

                    // Note: If worker uses callbacks, we might get double updates, which is fine.
                    console.log(`[Job ${job.id}] Sync result: ${JSON.stringify(data)}`);

                    // We can rely on the final response here too
                    /* 
                    await prisma.job.update({
                         where: { id: job.id },
                         data: { 
                             status: data.status,
                             outputResult: data.resultUrl ? { url: data.resultUrl } : undefined,
                             errorMessage: data.error
                         }
                    });
                    */
                }
            }
        }).catch(async (err) => {
            console.error(`[Job ${job.id}] Dispatch Network Error:`, err);
            await prisma.job.update({
                where: { id: job.id },
                data: { status: 'failed', errorMessage: `Dispatch error: ${err.message}` }
            });
        });

        return NextResponse.json({
            success: true,
            jobId: job.id,
            status: 'pending',
            message: 'Render job queued successfully'
        });

    } catch (error: any) {
        console.error('Error queuing render job:', error);
        return NextResponse.json({ error: 'Internal Server Error: ' + error.message }, { status: 500 });
    }
}
