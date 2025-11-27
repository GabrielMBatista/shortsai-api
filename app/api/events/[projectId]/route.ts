import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Global map to track active SSE connections per project
const connections = new Map<string, Set<ReadableStreamDefaultController>>();

// Helper to broadcast updates to all connected clients for a project
export function broadcastProjectUpdate(projectId: string, data: any) {
    const controllers = connections.get(projectId);
    if (!controllers || controllers.size === 0) return;

    const message = `data: ${JSON.stringify(data)}\n\n`;
    const encoder = new TextEncoder();
    const encoded = encoder.encode(message);

    controllers.forEach(controller => {
        try {
            controller.enqueue(encoded);
        } catch (err) {
            console.error('[SSE] Failed to send to client:', err);
            controllers.delete(controller);
        }
    });
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    const { projectId } = await params;

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            console.log(`[SSE] Client connected to project ${projectId}`);

            // Register this controller
            if (!connections.has(projectId)) {
                connections.set(projectId, new Set());
            }
            connections.get(projectId)!.add(controller);

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
                            errorMessage: s.error_message
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
                connections.get(projectId)?.delete(controller);
                if (connections.get(projectId)?.size === 0) {
                    connections.delete(projectId);
                }
            });
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no', // Disable nginx buffering
        },
    });
}
