import { NextResponse } from 'next/server';
import { AIService } from '@/lib/ai/ai-service';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { apiKeys } = body;

        const voices = await AIService.getElevenLabsVoices("frontend-request", apiKeys?.elevenLabs);

        return NextResponse.json({ voices });
    } catch (error: any) {
        console.error('Voice fetch failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
