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
                        version: true,
                        characters: {
                            select: {
                                id: true,
                                name: true,
                                description: true,
                                images: true,
                                user_id: true,
                                created_at: true
                            }
                        }
                    }
                },
                ProjectCharacters: {
                    select: {
                        characters: {
                            select: {
                                id: true,
                                name: true,
                                description: true,
                                images: true,
                                user_id: true,
                                created_at: true
                            }
                        }
                    }
                },
            },
        });

        if (!project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        if (project.user_id !== session.user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const mappedProject = {
            ...project,
            ProjectCharacters: undefined,
            characters: project.ProjectCharacters.map(pc => pc.characters)
        };

        return NextResponse.json(mappedProject);
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

        // Transaction handling for character updates if needed, since explicit relation requires separate Ops
        // But prisma update 'data' handles nested writes? 
        // For explicit Many-to-Many, we can use `deleteMany` then `create` or `set` isn't available directly on the explicit model wrapper usually in the same way.
        // Actually, with explicit M-N, we might need a transaction: Delete old links, Create new links.
        // Or using `ProjectCharacters: { deleteMany: {}, create: ... }`.

        if (characterIds && Array.isArray(characterIds)) {
            updateData.ProjectCharacters = {
                deleteMany: {}, // Remove all existing
                create: characterIds.map((charId: string) => ({
                    characters: { connect: { id: charId } }
                }))
            };
        }

        const project = await prisma.project.update({
            where: { id },
            data: updateData,
            include: {
                ProjectCharacters: { include: { characters: true } },
                scenes: {
                    where: { deleted_at: null },
                    orderBy: { scene_number: 'asc' },
                    include: { characters: true }
                }
            }
        });

        // Invalidate fetching folders cache if folder_id OR is_archived changed
        if (updateData.folder_id !== undefined || updateData.is_archived !== undefined) {
            const { invalidateCache } = await import('@/lib/redis');
            await invalidateCache(`api:folders:${session.user.id}`);
        }

        const mappedProject = {
            ...project,
            ProjectCharacters: undefined,
            characters: project.ProjectCharacters.map(pc => pc.characters)
        };

        return NextResponse.json(mappedProject);
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

        // Fetch project with scenes to get all asset URLs
        const existingProject = await prisma.project.findUnique({
            where: { id },
            select: {
                user_id: true,
                bg_music_url: true,
                scenes: {
                    where: { deleted_at: null },
                    select: {
                        image_url: true,
                        audio_url: true,
                        video_url: true,
                        sfx_url: true,
                    }
                }
            }
        });

        if (!existingProject) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        if (existingProject.user_id !== session.user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Delete all assets from R2
        const { deleteFromR2 } = await import('@/lib/storage');

        // Delete scene assets
        for (const scene of existingProject.scenes) {
            await Promise.all([
                deleteFromR2(scene.image_url),
                deleteFromR2(scene.audio_url),
                deleteFromR2(scene.video_url),
                deleteFromR2(scene.sfx_url),
            ]);
        }

        // Delete background music
        await deleteFromR2(existingProject.bg_music_url);

        // Now delete from database
        await prisma.project.delete({
            where: { id },
        });

        // Invalidate folders cache as deleting a project changes counts
        const { invalidateCache } = await import('@/lib/redis');
        await invalidateCache(`api:folders:${session.user.id}`);

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error deleting project:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
