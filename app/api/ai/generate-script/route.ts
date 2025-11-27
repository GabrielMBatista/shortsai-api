import { NextResponse } from 'next/server';
import { AIService } from '@/lib/ai/ai-service';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { userId, topic, style, language, durationConfig, apiKeys } = body;

        if (!userId || !topic || !style) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const script = await AIService.generateScript(
            userId,
            topic,
            style,
            language || 'English',
            durationConfig || { min: 30, max: 60 },
            apiKeys
        );

        return NextResponse.json(script);
    } catch (error: any) {
        console.error('Script generation failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
