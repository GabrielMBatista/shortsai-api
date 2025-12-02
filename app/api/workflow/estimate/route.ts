import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
    try {
        const { projectId } = await req.json();

        if (!projectId) {
            return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
        }

        const project = await prisma.project.findUnique({
            where: { id: projectId },
            include: { scenes: true }
        });

        if (!project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        let estimatedImages = 0;
        let estimatedAudioSeconds = 0;
        let estimatedVideo = 0;

        // Calculate estimates based on pending status or draft
        // If status is 'completed', we don't count it as "to be used" unless we are regenerating?
        // But this endpoint might be called before "Generate All".
        // Let's assume we want to know the cost of the *remaining* work or *total* work?
        // Usually "Estimate" is for the *next* action.
        // But if the user clicks "Generate All", it generates everything not yet done.

        // Let's count items that are NOT completed.

        for (const scene of project.scenes) {
            // Count images if not completed
            if (scene.image_status !== 'completed') {
                estimatedImages++;
            }

            // Count audio if not completed
            if (scene.audio_status !== 'completed') {
                const wordCount = scene.narration.split(/\s+/).length;
                const estimatedDuration = wordCount / 2.5;
                estimatedAudioSeconds += estimatedDuration;
            }

            // Count video if queued or processing (or if we want to show potential cost for all?)
            // For now, let's count it if it's explicitly queued or if the user asks for it.
            // But usually this endpoint is called to see "what's left to do".
            // If video_status is 'draft', it means it hasn't been requested yet.
            // If we want to show "Total Project Cost", we should count everything.
            // But the HUD says "Est. Cost (This Project)".
            // Let's count video if it is NOT completed, assuming the user might want to generate it.
            // However, video is expensive. Let's only count if status is NOT draft (i.e. queued/processing) OR if we assume the user wants a video.
            // Given the "Generate All" usually implies Images+Audio, maybe we shouldn't assume Video unless queued.

            if ((scene as any).video_status === 'queued' || (scene as any).video_status === 'processing') {
                estimatedVideo++;
            }
        }

        // If we want to show the cost of the *entire* project (even parts already done? No, usually "remaining cost" or "total cost"?)
        // "Est. Cost" usually implies "What I am about to spend".
        // But if I already spent it, it's not "Estimated".
        // Let's stick to "Remaining to be generated".

        // For video, if the project is "generating" and video is not queued, it won't be generated.


        const estimatedAudioMinutes = Math.ceil(estimatedAudioSeconds / 60);

        return NextResponse.json({
            estimatedImages,
            estimatedAudioMinutes,
            estimatedVideo,
            estimatedAudioSeconds
        });

    } catch (error: any) {
        console.error('Error estimating workflow cost:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
