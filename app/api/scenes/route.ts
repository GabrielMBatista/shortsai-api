import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const {
            project_id,
            scene_number,
            visual_description,
            narration,
            duration_seconds,
        } = body;

        if (!project_id || scene_number === undefined || !visual_description || !narration || !duration_seconds) {
            console.error("Missing fields:", { project_id, scene_number, visual_description, narration, duration_seconds });
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Check for existing active scene with same number to prevent duplicates
        const existingScene = await prisma.scene.findFirst({
            where: {
                project_id,
                scene_number,
                deleted_at: null
            }
        });

        let scene;
        if (existingScene) {
            scene = await prisma.scene.update({
                where: { id: existingScene.id },
                data: {
                    visual_description,
                    narration,
                    duration_seconds,
                },
            });
        } else {
            scene = await prisma.scene.create({
                data: {
                    project_id,
                    scene_number,
                    visual_description,
                    narration,
                    duration_seconds,
                },
            });
        }

        return NextResponse.json(scene);
    } catch (error: any) {
        console.error('Error creating scene:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error', details: error }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({ status: 'ok' });
}
