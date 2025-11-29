import { NextResponse } from 'next/server';
import { AIService } from '@/lib/ai/ai-service';
import { auth } from '@/lib/auth';
import { aiGenerateSchema } from '@/lib/schemas';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();

        const validation = aiGenerateSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({
                error: 'Validation Error',
                details: validation.error.format()
            }, { status: 400 });
        }

        const { action, params, apiKeys } = validation.data;
        const userId = session.user.id;

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
        }

        return NextResponse.json({ result });

    } catch (error: any) {
        console.error('[AI API] Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
