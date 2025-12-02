import { prisma } from '@/lib/prisma';

export async function trackUsage(userId: string, provider: string, model: string, type: 'image' | 'audio' | 'text' | 'music' | 'video', duration?: number) {
    console.log(`[Usage] User ${userId} used ${provider}/${model} for ${type}`);

    let action: any = 'GENERATE_SCRIPT';
    if (type === 'image') action = 'GENERATE_IMAGE';
    if (type === 'audio') action = 'GENERATE_TTS';
    if (type === 'music') action = 'GENERATE_MUSIC';
    if (type === 'text') action = 'GENERATE_SCRIPT';
    if (type === 'video') action = 'GENERATE_VIDEO';

    try {
        await prisma.$transaction(async (tx) => {
            await tx.usageLog.create({
                data: {
                    user_id: userId,
                    action_type: action,
                    provider: provider,
                    model_name: model,
                    status: 'success',
                    tokens_input: 0, // TODO: Count tokens
                    tokens_output: 0,
                    duration_seconds: duration || 0
                }
            });

            // Update limits
            if (type === 'image') {
                await tx.userLimits.update({
                    where: { user_id: userId },
                    data: { current_images_used: { increment: 1 } }
                });
            } else if (type === 'audio' && duration) {
                await tx.userLimits.update({
                    where: { user_id: userId },
                    data: { current_minutes_tts_used: { increment: duration / 60 } }
                });
            } else if (type === 'video') {
                await tx.userLimits.update({
                    where: { user_id: userId },
                    data: { current_videos_used: { increment: 1 } }
                });
            }
        });
    } catch (e) {
        console.error("Failed to log usage", e);
    }
}

export async function checkLimits(userId: string, type: 'image' | 'audio' | 'video'): Promise<boolean> {
    const limits = await prisma.userLimits.findUnique({ where: { user_id: userId } });
    if (!limits) return true; // Allow if no limits record (or create one?)

    if (type === 'image') {
        return limits.current_images_used < limits.monthly_images_limit;
    }
    if (type === 'audio') {
        // Decimal comparison
        return Number(limits.current_minutes_tts_used) < limits.monthly_minutes_tts;
    }
    if (type === 'video') {
        return limits.current_videos_used < limits.monthly_videos_limit;
    }
    return true;
}
