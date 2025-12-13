import { NextResponse } from 'next/server';
import { AIService } from '@/lib/ai/ai-service';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    let userId: string | undefined;

    try {
        const body = await request.json();
        userId = body.userId;
        const { topic, style, language, durationConfig, apiKeys, personaId, channelId } = body;

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
            { personaId, channelId }
        );

        return NextResponse.json(script);
    } catch (error: any) {
        console.error('Script generation failed:', error);

        if (userId) {
            try {
                // Import prisma dynamically or at top level? Top level is fine.
                // We need to import prisma if not already imported. It is not imported in this file?
                // Wait, previous file view showed only imports: NextResponse, AIService.
                // We need to import prisma.
                const { prisma } = await import('@/lib/prisma');
                await prisma.usageLog.create({
                    data: {
                        user_id: userId,
                        action_type: 'GENERATE_SCRIPT',
                        provider: 'gemini',
                        model_name: 'gemini-2.5-flash',
                        status: 'failed',
                        error_message: error.message,
                        tokens_input: 0,
                        tokens_output: 0
                    }
                });
            } catch (logError) {
                console.error("Failed to log script failure", logError);
            }
        }

        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
