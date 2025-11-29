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
        const character = await prisma.character.findUnique({
            where: { id },
        });

        if (!character) {
            return NextResponse.json({ error: 'Character not found' }, { status: 404 });
        }

        if (character.user_id !== session.user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        return NextResponse.json(character);
    } catch (error: any) {
        console.error('Error fetching character:', error);
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

        // Check if character exists
        const character = await prisma.character.findUnique({
            where: { id },
        });

        if (!character) {
            return NextResponse.json({ error: 'Character not found' }, { status: 404 });
        }

        if (character.user_id !== session.user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        await prisma.character.delete({
            where: { id },
        });

        return NextResponse.json({ message: 'Character deleted successfully' }, { status: 200 });
    } catch (error: any) {
        console.error('Error deleting character:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
