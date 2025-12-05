import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

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

        const scene = await prisma.scene.findUnique({
            where: { id },
            select: {
                project_id: true,
                image_url: true,
                audio_url: true,
                video_url: true,
                project: {
                    select: { user_id: true }
                }
            }
        });

        if (!scene) {
            return NextResponse.json({ error: 'Scene not found' }, { status: 404 });
        }

        if (scene.project.user_id !== session.user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Return null if fields are empty or not present, ensuring consistent API response
        return NextResponse.json({
            image_base64: scene.image_url || null,
            audio_base64: scene.audio_url || null,
            video_base64: scene.video_url || null
        });
    } catch (error: any) {
        console.error('Error fetching scene media:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
