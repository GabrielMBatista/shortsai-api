import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { Prisma, Character } from '@prisma/client';
import { auth } from '@/lib/auth';
import { createProjectSchema } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();

        // Validate input using Zod
        const validation = createProjectSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({
                error: 'Validation Error',
                details: validation.error.format()
            }, { status: 400 });
        }

        const {
            topic,
            style,
            language,
            voice_name,
            tts_provider,
            reference_image_url,
            characterIds,
            include_music,
            bg_music_prompt,
            duration_config,
        } = validation.data;

        const user_id = session.user.id;

        // If characterIds provided, fetch character data and create snapshot
        let reference_characters_snapshot: Prisma.InputJsonValue | undefined;
        if (characterIds && Array.isArray(characterIds) && characterIds.length > 0) {
            const characters = await prisma.character.findMany({
                where: {
                    id: { in: characterIds },
                    user_id, // Ensure characters belong to the user
                },
            });

            // Create snapshot in the format expected by frontend
            reference_characters_snapshot = characters.map((char: Character) => ({
                id: char.id,
                name: char.name,
                description: char.description,
                images: char.images,
            })) as Prisma.InputJsonValue;
        }

        const project = await prisma.project.create({
            data: {
                user_id,
                topic,
                style,
                language,
                voice_name,
                tts_provider,
                reference_image_url,
                // We still support snapshot for legacy/backup, but primary link is relation
                ...(reference_characters_snapshot && { reference_characters_snapshot }),
                include_music,
                bg_music_prompt,
                bg_music_status: include_music ? 'pending' : null,
                duration_config: duration_config || Prisma.JsonNull,
                status: 'draft',
                characters: {
                    connect: characterIds?.map((id: string) => ({ id })) || [],
                },
            },
            include: { characters: true },
        });

        return NextResponse.json(project);
    } catch (error: any) {
        console.error('Error creating project:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user_id = session.user.id;

        const projects = await prisma.project.findMany({
            where: { user_id },
            orderBy: { created_at: 'desc' },
            select: {
                id: true,
                user_id: true,
                topic: true,
                style: true,
                language: true,
                voice_name: true,
                tts_provider: true,
                created_at: true,
                generated_title: true,
                generated_description: true,
                status: true,
                scenes: {
                    where: { deleted_at: null },
                    select: {
                        id: true,
                        image_status: true,
                        image_url: true,
                        audio_status: true
                    },
                    orderBy: { scene_number: 'asc' }
                }
            }
        });

        return NextResponse.json(projects);
    } catch (error: any) {
        console.error('Error fetching projects:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
