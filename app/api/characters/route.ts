import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { Character } from '@prisma/client';

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
            orderBy: { created_at: 'desc' },
        });

        return NextResponse.json(characters);
    } catch (error: any) {
        console.error('Error fetching characters:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error', details: error }, { status: 500 });
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

        const character = await prisma.character.create({
            data: {
                user_id,
                name,
                description,
                images, // Now directly storing the array of strings
            },
        });

        return NextResponse.json(character, { status: 201 });
    } catch (error: any) {
        console.error('Error creating character:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error', details: error }, { status: 500 });
    }
}

