import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { addConnection, removeConnection } from '@/lib/sse/sse-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    const { projectId } = await params;
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            console.log(`[SSE] Client connected to project ${projectId}`);
            addConnection(projectId, controller);

            // Send initial state
            try {
                const project = await prisma.project.findUnique({
                    where: { id: projectId },
                    include: {
                        scenes: { orderBy: { scene_number: 'asc' } }
                    }
                });

                if (project) {
                    const initialData = {
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
                            durationSeconds: s.duration_seconds
                        })),
                        bgMusicStatus: project.bg_music_status,
                        bgMusicUrl: project.bg_music_url
                    };

                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(initialData)}\n\n`));
                }
            } catch (err) {
                console.error('[SSE] Failed to send initial state:', err);
            }

            // Keep-alive ping every 30 seconds
            const keepAlive = setInterval(() => {
                try {
                    controller.enqueue(encoder.encode(`: ping\n\n`));
                } catch {
                    clearInterval(keepAlive);
                }
            }, 30000);

            // Cleanup on close
            request.signal.addEventListener('abort', () => {
                console.log(`[SSE] Client disconnected from project ${projectId}`);
                clearInterval(keepAlive);
                removeConnection(projectId, controller);
            });
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no', // Disable nginx buffering
            'Access-Control-Allow-Origin': '*',
        },
    });
}
