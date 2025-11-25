import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { Character, CharacterImage } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const user_id = searchParams.get('user_id');

        if (!user_id) {
            return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
        }

        const characters = await prisma.character.findMany({
            where: { user_id },
            include: {
                images: {
                    orderBy: { created_at: 'asc' }
                }
            },
            orderBy: { created_at: 'desc' },
        });

        // Transform to match API spec format
        const transformedCharacters = characters.map((char: Character & { images: CharacterImage[] }) => ({
            id: char.id,
            name: char.name,
            description: char.description,
            images: char.images.map((img: CharacterImage) => img.image_url),
        }));

        return NextResponse.json(transformedCharacters);
    } catch (error) {
        console.error('Error fetching characters:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { user_id, name, description, images } = body;

        if (!user_id || !name || !images || !Array.isArray(images) || images.length === 0) {
            return NextResponse.json(
                { error: 'user_id, name, and images array are required' },
                { status: 400 }
            );
        }

        // Create character with images in a transaction
        const character = await prisma.character.create({
            data: {
                user_id,
                name,
                description,
                images: {
                    create: images.map((imageUrl: string) => ({
                        image_url: imageUrl,
                    })),
                },
            },
            include: { images: true },
        });

        // Transform response to match API spec
        const response = {
            id: character.id,
            name: character.name,
            description: character.description,
            images: character.images.map((img: CharacterImage) => img.image_url),
        };

        return NextResponse.json(response, { status: 201 });
    } catch (error) {
        console.error('Error creating character:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

