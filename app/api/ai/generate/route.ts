import { NextResponse } from 'next/server';
import { AIService } from '@/lib/ai/ai-service';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { action, userId, params, apiKeys } = body;

        if (!userId || !action) {
            return NextResponse.json({ error: 'Missing userId or action' }, { status: 400 });
        }

        let result;

        switch (action) {
            case 'generate_script':
                result = await AIService.generateScript(
                    userId,
                    params.topic,
                    params.style,
                    params.language,
                    params.durationConfig,
                    apiKeys
                );
                break;
            case 'generate_music_prompt':
                result = await AIService.generateMusicPrompt(
                    userId,
                    params.topic,
                    params.style,
                    apiKeys
                );
                break;
            case 'analyze_character':
                result = await AIService.analyzeCharacterFeatures(
                    userId,
                    params.base64Image,
                    apiKeys
                );
                break;
            case 'optimize_image':
                result = await AIService.optimizeReferenceImage(
                    userId,
                    params.base64Image,
                    apiKeys
                );
                break;
            default:
                return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

        return NextResponse.json({ result });

    } catch (error: any) {
        console.error('[AI API] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
