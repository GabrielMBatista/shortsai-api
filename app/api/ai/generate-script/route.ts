import { NextResponse } from 'next/server';
import { AIService } from '@/lib/ai/ai-service';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { userId, topic, style, language, durationConfig, apiKeys, characterDescription } = body;

        if (!userId || !topic || !style) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const script = await AIService.generateScript(
            userId,
            topic,
            style,
            language || 'English',
            durationConfig || { min: 65, max: 90 },
            apiKeys,
            characterDescription
        );

        return NextResponse.json(script);
    } catch (error: any) {
        console.error('Script generation failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
