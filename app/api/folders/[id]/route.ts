import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const updateFolderSchema = z.object({
    name: z.string().min(1).max(50).optional(),
    parent_id: z.string().nullable().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const body = await request.json();
        const validation = updateFolderSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ error: 'Validation Error', details: validation.error.format() }, { status: 400 });
        }

        const { name, parent_id } = validation.data;
        const user_id = session.user.id;

        // Verify ownership
        const existingFolder = await prisma.folder.findUnique({
            where: { id },
        });

        if (!existingFolder || existingFolder.user_id !== user_id) {
            return NextResponse.json({ error: 'Folder not found or access denied' }, { status: 404 });
        }

        // Prevent circular dependency if moving
        if (parent_id) {
            if (parent_id === id) {
                return NextResponse.json({ error: 'Cannot move folder into itself' }, { status: 400 });
            }
            // Naive cycle check could be added here if needed, but for now simplified.
        }

        const dataToUpdate: any = {};
        if (name !== undefined) dataToUpdate.name = name;
        if (parent_id !== undefined) dataToUpdate.parent_id = parent_id;

        const updatedFolder = await prisma.folder.update({
            where: { id },
            data: dataToUpdate,
        });

        // Invalidate cache
        const { invalidateCache } = await import('@/lib/redis');
        await invalidateCache(`api:folders:${user_id}`);

        return NextResponse.json(updatedFolder);
    } catch (error: any) {
        if (error.code === 'P2002') {
            return NextResponse.json({ error: 'Folder with this name already exists' }, { status: 409 });
        }
        console.error('Error updating folder:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const user_id = session.user.id;

        // Verify ownership
        const existingFolder = await prisma.folder.findUnique({
            where: { id },
        });

        if (!existingFolder || existingFolder.user_id !== user_id) {
            return NextResponse.json({ error: 'Folder not found or access denied' }, { status: 404 });
        }

        // Helper to get all descendant folder IDs
        const getAllDescendantIds = async (rootId: string): Promise<string[]> => {
            const children = await prisma.folder.findMany({
                where: { parent_id: rootId },
                select: { id: true }
            });
            let ids = children.map(c => c.id);
            for (const childId of ids) {
                const subIds = await getAllDescendantIds(childId);
                ids = [...ids, ...subIds];
            }
            return ids;
        };

        const folderIdsToDelete = [id, ...(await getAllDescendantIds(id))];

        // Fetch all projects in these folders to delete assets
        const projectsToDelete = await prisma.project.findMany({
            where: { folder_id: { in: folderIdsToDelete } },
            select: {
                bg_music_url: true,
                scenes: {
                    select: {
                        image_url: true,
                        audio_url: true,
                        video_url: true,
                        sfx_url: true,
                    }
                }
            }
        });

        // Delete Assets from R2
        if (projectsToDelete.length > 0) {
            const { deleteFromR2 } = await import('@/lib/storage');
            for (const project of projectsToDelete) {
                if (project.bg_music_url) await deleteFromR2(project.bg_music_url);
                for (const scene of project.scenes) {
                    if (scene.image_url) await deleteFromR2(scene.image_url);
                    if (scene.audio_url) await deleteFromR2(scene.audio_url);
                    if (scene.video_url) await deleteFromR2(scene.video_url);
                    if (scene.sfx_url) await deleteFromR2(scene.sfx_url);
                }
            }
        }

        // Delete the root folder (Cascades to subfolders and projects in DB)
        await prisma.folder.delete({
            where: { id },
        });

        // Invalidate cache
        const { invalidateCache } = await import('@/lib/redis');
        await invalidateCache(`api:folders:${user_id}`);

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error deleting folder:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
