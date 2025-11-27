import { NextResponse } from 'next/server';
import { AIService } from '@/lib/ai/ai-service';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { userId, topic, style, apiKeys } = body;

        if (!userId || !topic || !style) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const prompt = await AIService.generateMusicPrompt(userId, topic, style, apiKeys);

        return NextResponse.json({ prompt });
    } catch (error: any) {
        console.error('Music prompt generation failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
