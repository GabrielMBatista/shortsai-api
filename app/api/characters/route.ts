import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { Character } from '@prisma/client';
import { auth } from '@/lib/auth';
import { createCharacterSchema } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user_id = session.user.id;

        const characters = await prisma.character.findMany({
            where: { user_id },
            orderBy: { created_at: 'desc' },
        });

        return NextResponse.json(characters);
    } catch (error: any) {
        console.error('Error fetching characters:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();

        const validation = createCharacterSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({
                error: 'Validation Error',
                details: validation.error.format()
            }, { status: 400 });
        }

        const { name, description, images } = validation.data;
        const user_id = session.user.id;

        const character = await prisma.character.create({
            data: {
                user_id,
                name,
                description: description || null,
                images,
            },
        });

        return NextResponse.json(character, { status: 201 });
    } catch (error: any) {
        console.error('Error creating character:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

