import { NextResponse } from 'next/server';
import { AIService } from '@/lib/ai/ai-service';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { userId, text, voice, provider, apiKeys } = body;

        if (!userId || !text || !voice) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const audioUrl = await AIService.generateAudio(userId, text, voice, provider || 'gemini', apiKeys);

        return NextResponse.json({ audioUrl });
    } catch (error: any) {
        console.error('Audio generation failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
