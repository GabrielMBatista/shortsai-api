import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const updateFolderSchema = z.object({
    name: z.string().min(1).max(50),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = params;
        const body = await request.json();
        const validation = updateFolderSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ error: 'Validation Error', details: validation.error.format() }, { status: 400 });
        }

        const { name } = validation.data;
        const user_id = session.user.id;

        // Verify ownership
        const existingFolder = await prisma.folder.findUnique({
            where: { id },
        });

        if (!existingFolder || existingFolder.user_id !== user_id) {
            return NextResponse.json({ error: 'Folder not found or access denied' }, { status: 404 });
        }

        const updatedFolder = await prisma.folder.update({
            where: { id },
            data: { name },
        });

        return NextResponse.json(updatedFolder);
    } catch (error: any) {
        if (error.code === 'P2002') {
            return NextResponse.json({ error: 'Folder with this name already exists' }, { status: 409 });
        }
        console.error('Error updating folder:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = params;
        const user_id = session.user.id;

        // Verify ownership
        const existingFolder = await prisma.folder.findUnique({
            where: { id },
        });

        if (!existingFolder || existingFolder.user_id !== user_id) {
            return NextResponse.json({ error: 'Folder not found or access denied' }, { status: 404 });
        }

        // Optional: Move projects to root (null folder) before deleting, or cascade delete?
        // Prisma schema doesn't have cascade delete on projects->folder, so projects will just have folder_id set to null if we don't handle it.
        // Actually, if we delete the folder, we should probably just set project.folder_id to null.
        // Let's explicitly do that to be safe, although SetNull on delete in schema would handle it if configured.
        // Checking schema: folder Folder? @relation(fields: [folder_id], references: [id])
        // No onDelete action specified, default is usually RESTRICT or NO ACTION in some DBs, but Prisma default depends.
        // Let's manually unlink projects first.

        await prisma.project.updateMany({
            where: { folder_id: id },
            data: { folder_id: null },
        });

        await prisma.folder.delete({
            where: { id },
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error deleting folder:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
