import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { auth } from '@/lib/auth';
import { updateProjectSchema } from '@/lib/schemas';

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

        const { id } = await params;
        const project = await prisma.project.findUnique({
            where: { id },
            select: {
                id: true,
                user_id: true,
                topic: true,
                style: true,
                language: true,
                voice_name: true,
                tts_provider: true,
                video_model: true,
                audio_model: true,
                include_music: true,
                bg_music_prompt: true,
                bg_music_status: true,
                status: true,
                generated_title: true,
                generated_description: true,
                duration_config: true,
                lock_session_id: true,
                lock_expires_at: true,
                is_archived: true,
                tags: true,
                folder_id: true,
                created_at: true,
                updated_at: true,
                // Excluding heavy base64 fields: reference_image_url, bg_music_url, etc.
                
                scenes: {
                    where: { deleted_at: null },
                    orderBy: { scene_number: 'asc' },
                    select: {
                        id: true,
                        project_id: true,
                        scene_number: true,
                        visual_description: true,
                        narration: true,
                        duration_seconds: true,
                        image_status: true,
                        audio_status: true,
                        sfx_status: true,
                        video_status: true,
                        media_type: true,
                        word_timings: true,
                        error_message: true,
                        image_attempts: true,
                        audio_attempts: true,
                        sfx_attempts: true,
                        video_attempts: true,
                        created_at: true,
                        deleted_at: true,
                        status: true,
                        version: true
                        // Excluding: image_url, audio_url, video_url, sfx_url
                    }
                },
                characters: true,
            },
        });

        if (!project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        if (project.user_id !== session.user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        return NextResponse.json(project);
    } catch (error: any) {
        console.error('Error fetching project:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const body = await request.json();

        // Validate input
        const validation = updateProjectSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({
                error: 'Validation Error',
                details: validation.error.format()
            }, { status: 400 });
        }

        // Check if project exists and belongs to user
        const existingProject = await prisma.project.findUnique({
            where: { id },
            select: { user_id: true }
        });

        if (!existingProject) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        if (existingProject.user_id !== session.user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Extract characterIds to handle relation update separately if needed
        const { characterIds, ...rest } = validation.data;

        const updateData: any = { ...rest };

        if (characterIds && Array.isArray(characterIds)) {
            // Use set to replace all existing characters with the new list
            updateData.characters = {
                set: characterIds.map((charId: string) => ({ id: charId })),
            };
        }

        const project = await prisma.project.update({
            where: { id },
            data: updateData,
            include: { characters: true, scenes: { where: { deleted_at: null }, orderBy: { scene_number: 'asc' } } }
        });

        return NextResponse.json(project);
    } catch (error: any) {
        console.error('Error updating project:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        const existingProject = await prisma.project.findUnique({
            where: { id },
            select: { user_id: true }
        });

        if (!existingProject) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        if (existingProject.user_id !== session.user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        await prisma.project.delete({
            where: { id },
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error deleting project:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
