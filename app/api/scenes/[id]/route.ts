import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

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
        const {
            visual_description,
            narration,
            duration_seconds,
        } = body;

        // Verify ownership
        const existingScene = await prisma.scene.findUnique({
            where: { id },
            include: { project: true }
        });

        if (!existingScene) {
            return NextResponse.json({ error: 'Scene not found' }, { status: 404 });
        }

        if (existingScene.project.user_id !== session.user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const scene = await prisma.scene.update({
            where: { id },
            data: {
                visual_description,
                narration,
                duration_seconds,
            },
        });

        return NextResponse.json(scene);
    } catch (error: any) {
        console.error('Error updating scene:', error);
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

        // Verify ownership
        const existingScene = await prisma.scene.findUnique({
            where: { id },
            include: { project: true }
        });

        if (!existingScene) {
            return NextResponse.json({ error: 'Scene not found' }, { status: 404 });
        }

        if (existingScene.project.user_id !== session.user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        await prisma.scene.update({
            where: { id },
            data: { deleted_at: new Date() }
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error deleting scene:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
