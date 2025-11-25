import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { user_id, gemini_key, elevenlabs_key, suno_key } = body;

        if (!user_id) {
            return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
        }

        // WARNING: Keys are stored as received. 
        // If the frontend hashes them, the backend CANNOT use them to make API calls.
        // HTTPS protects them in transit. 

        const apiKeys = await prisma.apiKey.upsert({
            where: { user_id },
            update: {
                gemini_key,
                elevenlabs_key,
                suno_key,
            },
            create: {
                user_id,
                gemini_key,
                elevenlabs_key,
                suno_key,
            },
        });

        return NextResponse.json({ message: 'API keys saved successfully' });
    } catch (error: any) {
        console.error('Error saving API keys:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const user_id = searchParams.get('user_id');

        if (!user_id) {
            return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
        }

        const apiKeys = await prisma.apiKey.findUnique({
            where: { user_id },
        });

        if (!apiKeys) {
            return NextResponse.json({
                gemini_key: null,
                elevenlabs_key: null,
                suno_key: null
            });
        }

        return NextResponse.json({
            gemini_key: apiKeys.gemini_key,
            elevenlabs_key: apiKeys.elevenlabs_key,
            suno_key: apiKeys.suno_key,
        });
    } catch (error: any) {
        console.error('Error fetching API keys:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error', details: error }, { status: 500 });
    }
}
