import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const character = await prisma.character.findUnique({
            where: { id },
        });

        if (!character) {
            return NextResponse.json({ error: 'Character not found' }, { status: 404 });
        }

        return NextResponse.json(character);
    } catch (error: any) {
        console.error('Error fetching character:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error', details: error }, { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        // Check if character exists
        const character = await prisma.character.findUnique({
            where: { id },
        });

        if (!character) {
            return NextResponse.json({ error: 'Character not found' }, { status: 404 });
        }

        await prisma.character.delete({
            where: { id },
        });

        return NextResponse.json({ message: 'Character deleted successfully' }, { status: 200 }); // Or 204 No Content
    } catch (error: any) {
        console.error('Error deleting character:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error', details: error }, { status: 500 });
    }
}
