import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const project = await prisma.project.findUnique({
            where: { id },
            include: {
                scenes: { where: { deleted_at: null }, orderBy: { scene_number: 'asc' } },
                characters: true,
            },
        });

        if (!project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        return NextResponse.json(project);
    } catch (error: any) {
        console.error('Error fetching project:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error', details: error }, { status: 500 });
    }
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();

        // Check if project exists first
        const existingProject = await prisma.project.findUnique({
            where: { id },
            include: { characters: true } // Include relations to check state if needed
        });

        if (!existingProject) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        // Extract characterIds to handle relation update separately if needed
        const { characterIds, ...rest } = body;

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
        return NextResponse.json({ error: error.message || 'Internal Server Error', details: error }, { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        await prisma.project.delete({
            where: { id },
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error deleting project:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error', details: error }, { status: 500 });
    }
}
