import { prisma } from '@/lib/prisma';

export async function trackUsage(userId: string, provider: string, model: string, type: 'image' | 'audio' | 'text' | 'music' | 'video') {
    console.log(`[Usage] User ${userId} used ${provider}/${model} for ${type}`);

    let action: any = 'GENERATE_SCRIPT';
    if (type === 'image') action = 'GENERATE_IMAGE';
    if (type === 'audio') action = 'GENERATE_TTS';
    if (type === 'music') action = 'GENERATE_MUSIC';
    if (type === 'text') action = 'GENERATE_SCRIPT';
    if (type === 'video') action = 'GENERATE_VIDEO';

    try {
        await prisma.usageLog.create({
            data: {
                user_id: userId,
                action_type: action,
                provider: provider,
                model_name: model,
                status: 'success',
                tokens_input: 0, // TODO: Count tokens
                tokens_output: 0
            }
        });
    } catch (e) {
        console.error("Failed to log usage", e);
    }
}
