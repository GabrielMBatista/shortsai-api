import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { Prisma, Character, CharacterImage } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const {
            user_id,
            topic,
            style,
            language,
            voice_name,
            tts_provider,
            reference_image_url,
            characterIds,
            include_music,
            bg_music_prompt,
        } = body;

        if (!user_id || !topic || !style || !voice_name || !tts_provider) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // If characterIds provided, fetch character data and create snapshot
        let reference_characters_snapshot: Prisma.InputJsonValue | undefined;
        if (characterIds && Array.isArray(characterIds) && characterIds.length > 0) {
            const characters = await prisma.character.findMany({
                where: {
                    id: { in: characterIds },
                    user_id, // Ensure characters belong to the user
                },
                include: { images: true },
            });

            // Create snapshot in the format expected by frontend
            reference_characters_snapshot = characters.map((char: Character & { images: CharacterImage[] }) => ({
                id: char.id,
                name: char.name,
                description: char.description,
                images: char.images.map((img) => img.image_url),
            })) as Prisma.InputJsonValue;
        }

        const project = await prisma.project.create({
            data: {
                user_id,
                topic,
                style,
                language: language || 'en',
                voice_name,
                tts_provider,
                reference_image_url,
                ...(reference_characters_snapshot && { reference_characters_snapshot }),
                include_music: include_music || false,
                bg_music_prompt,
                bg_music_status: include_music ? 'pending' : null,
                status: 'draft',
            },
        });

        return NextResponse.json(project);
    } catch (error) {
        console.error('Error creating project:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const user_id = searchParams.get('user_id');

        if (!user_id) {
            return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
        }

        const projects = await prisma.project.findMany({
            where: { user_id },
            orderBy: { created_at: 'desc' },
            include: { scenes: true },
        });

        return NextResponse.json(projects);
    } catch (error) {
        console.error('Error fetching projects:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
