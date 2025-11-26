import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const {
            visual_description,
            narration,
            duration_seconds,
            image_url,
            image_status,
            audio_url,
            audio_status,
            error_message,
            attempts,
        } = body;

        const scene = await prisma.scene.update({
            where: { id },
            data: {
                visual_description,
                narration,
                duration_seconds,
                image_url,
                image_status,
                audio_url,
                audio_status,
                error_message,
                attempts,
            },
        });

        return NextResponse.json(scene);
    } catch (error: any) {
        console.error('Error updating scene:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error', details: error }, { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        await prisma.scene.delete({
            where: { id },
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error deleting scene:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error', details: error }, { status: 500 });
    }
}
