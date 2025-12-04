import { NextResponse } from 'next/server';
import { WorkflowService, WorkflowTask } from '@/lib/workflow/workflow-service';
import { AIService } from '@/lib/ai/ai-service';
import { prisma } from '@/lib/prisma';

export const maxDuration = 60; // Allow 60 seconds for generation
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const task: WorkflowTask = await request.json();

        if (!task || !task.id || !task.projectId) {
            return NextResponse.json({ error: 'Invalid task payload' }, { status: 400 });
        }

        console.log(`[Worker] Processing task ${task.id} (${task.action})`);

        // Get Project to get User ID (for API keys)
        const project = await prisma.project.findUnique({ where: { id: task.projectId } });
        if (!project) {
            throw new Error('Project not found');
        }

        let outputUrl: string | undefined;
        let timings: any[] | undefined;
        let duration: number | undefined;

        // Check Limits
        const limitType = task.action === 'generate_image' ? 'image' :
            (task.action === 'generate_audio' ? 'audio' :
                (task.action === 'generate_video' ? 'video' : null));

        if (limitType) {
            const { checkLimits } = await import('@/lib/ai/core/usage-tracker');
            const allowed = await checkLimits(project.user_id, limitType as any);
            if (!allowed) {
                throw new Error(`Quota exceeded for ${limitType}. Please upgrade your plan.`);
            }
        }

        try {
            switch (task.action) {
                case 'generate_image':
                    if ('prompt' in task.params) {
                        outputUrl = await AIService.generateImage(
                            project.user_id,
                            task.params.prompt,
                            project.style,
                            task.apiKeys
                        );
                    }
                    break;
                case 'generate_audio':
                    if ('text' in task.params) {
                        const result = await AIService.generateAudio(
                            project.user_id,
                            task.params.text,
                            task.params.voice,
                            task.params.provider,
                            task.apiKeys,
                            project.audio_model || undefined
                        );
                        outputUrl = result.url;
                        timings = result.timings;
                        duration = result.duration;
                    }
                    break;
                case 'generate_music':
                    if ('prompt' in task.params) {
                        outputUrl = await AIService.generateMusic(
                            project.user_id,
                            task.params.prompt,
                            task.apiKeys
                        );
                    }
                    break;
                case 'generate_video':
                    if (task.sceneId) {
                        const scene = await prisma.scene.findUnique({ where: { id: task.sceneId } });
                        if (scene && scene.image_url) {
                            const params = task.params as any;
                            outputUrl = await AIService.generateVideo(
                                project.user_id,
                                scene.image_url,
                                'prompt' in task.params ? task.params.prompt : '',
                                task.apiKeys,
                                params.model || 'veo-2.0-generate-001',
                                params.with_audio || false
                            );
                        } else {
                            throw new Error("Scene image not found for video generation");
                        }
                    }
                    break;
                default:
                    throw new Error(`Unknown action ${task.action}`);
            }

            // Complete Task
            await WorkflowService.completeTask(
                task.projectId,
                task.sceneId!,
                task.action === 'generate_image' ? 'image' : (task.action === 'generate_music' ? 'music' : (task.action === 'generate_video' ? 'video' : 'audio')),
                'completed',
                outputUrl,
                undefined,
                task.apiKeys,
                timings,
                duration
            );

            return NextResponse.json({ success: true, url: outputUrl });

        } catch (error: any) {
            console.error(`[Worker] Task failed: ${error.message}`);

            await WorkflowService.completeTask(
                task.projectId,
                task.sceneId!,
                task.action === 'generate_image' ? 'image' : (task.action === 'generate_music' ? 'music' : (task.action === 'generate_video' ? 'video' : 'audio')),
                'failed',
                undefined,
                error.message,
                task.apiKeys
            );

            return NextResponse.json({ error: error.message }, { status: 500 });
        }

    } catch (error: any) {
        console.error('[Worker] System Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
