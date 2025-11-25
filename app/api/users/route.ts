import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { email, name, avatar_url, google_id } = body;

        if (!email || !name) {
            return NextResponse.json({ error: 'Email and Name are required' }, { status: 400 });
        }

        const user = await prisma.user.upsert({
            where: { email },
            update: {
                name,
                avatar_url,
                google_id,
            },
            create: {
                email,
                name,
                avatar_url,
                google_id,
            },
        });

        return NextResponse.json(user);
    } catch (error) {
        console.error('Error creating user:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const email = searchParams.get('email');

        if (email) {
            const user = await prisma.user.findUnique({
                where: { email },
                include: { api_keys: true },
            });
            return NextResponse.json(user);
        }

        const users = await prisma.user.findMany();
        return NextResponse.json(users);
    } catch (error) {
        console.error('Error fetching users:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
