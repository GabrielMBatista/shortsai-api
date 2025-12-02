import { prisma } from '@/lib/prisma';

export class RateLimiter {
    // --- RATE LIMITING ---
    private static rpmCache = new Map<string, { count: number, resetAt: number }>();
    private static readonly RPM_LIMIT = 5; // 5 requests per minute per user

    static async checkRateLimits(userId: string) {
        // 1. Check RPM (In-Memory)
        const now = Date.now();
        const userRpm = this.rpmCache.get(userId);

        if (userRpm && now < userRpm.resetAt) {
            if (userRpm.count >= this.RPM_LIMIT) {
                throw new Error("Rate limit exceeded (RPM). Please wait a moment.");
            }
            userRpm.count++;
        } else {
            this.rpmCache.set(userId, { count: 1, resetAt: now + 60000 });
        }

        // 2. Check RPD (Database)
        const limits = await prisma.userLimits.findUnique({ where: { user_id: userId } });

        // If no limits record exists, assume default (create one if needed, or just pass)
        // For now, let's assume if no record, we create one with defaults
        if (!limits) {
            await prisma.userLimits.create({ data: { user_id: userId } });
            return;
        }

        const today = new Date();
        const lastReset = new Date(limits.last_daily_reset);
        const isNewDay = today.getDate() !== lastReset.getDate() || today.getMonth() !== lastReset.getMonth();

        if (isNewDay) {
            await prisma.userLimits.update({
                where: { user_id: userId },
                data: {
                    current_daily_requests: 1,
                    current_daily_videos: 0,
                    last_daily_reset: today
                }
            });
        } else {
            if (limits.current_daily_requests >= limits.daily_requests_limit) {
                throw new Error(`Daily limit exceeded (${limits.daily_requests_limit} requests/day). Upgrade your plan.`);
            }
            await prisma.userLimits.update({
                where: { user_id: userId },
                data: { current_daily_requests: { increment: 1 } }
            });
        }
    }

    // --- VIDEO RATE LIMITING ---
    private static videoRpmCache = new Map<string, { count: number, resetAt: number }>();
    private static readonly VIDEO_RPM_LIMIT = 2;

    static async checkVideoCooldown(userId: string) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { last_video_generated_at: true }
        });

        if (user?.last_video_generated_at) {
            const diff = Date.now() - user.last_video_generated_at.getTime();
            if (diff < 40000) { // 40 seconds
                const waitSeconds = Math.ceil((40000 - diff) / 1000);
                throw new Error(`Please wait ${waitSeconds}s before generating another video.`);
            }
        }
    }

    static async updateVideoTimestamp(userId: string) {
        await prisma.user.update({
            where: { id: userId },
            data: { last_video_generated_at: new Date() }
        });
    }

    static async checkVideoRateLimits(userId: string, modelId: string = 'veo-2.0-generate-001') {
        // 1. Check RPM (In-Memory)
        const now = Date.now();
        const userRpm = this.videoRpmCache.get(userId);

        if (userRpm && now < userRpm.resetAt) {
            if (userRpm.count >= this.VIDEO_RPM_LIMIT) {
                throw new Error("Video generation rate limit exceeded (2 RPM). Please wait a moment.");
            }
            userRpm.count++;
        } else {
            this.videoRpmCache.set(userId, { count: 1, resetAt: now + 60000 });
        }

        // 2. Check 40s Cooldown
        await this.checkVideoCooldown(userId);

        // 3. Check Daily Limits (Database - UserLimits Table)
        const limits = await prisma.userLimits.findUnique({ where: { user_id: userId } });
        if (!limits) {
            await prisma.userLimits.create({ data: { user_id: userId } });
            // We still need to update the last_video_generated_at
            await this.updateVideoTimestamp(userId);
            return;
        }

        const today = new Date();
        const lastReset = new Date(limits.last_daily_reset);
        const isNewDay = today.getDate() !== lastReset.getDate() || today.getMonth() !== lastReset.getMonth();

        // Determine limit based on model
        let dailyLimit = 10; // Default / Veo 3
        if (modelId.includes('veo-2.0')) {
            dailyLimit = 50;
        }

        if (isNewDay) {
            await prisma.$transaction([
                prisma.userLimits.update({
                    where: { user_id: userId },
                    data: {
                        current_daily_requests: 0,
                        current_daily_videos: 1, // Count this one
                        last_daily_reset: today
                    }
                }),
                prisma.user.update({
                    where: { id: userId },
                    data: { last_video_generated_at: today }
                })
            ]);
        } else {
            if (limits.current_daily_videos >= dailyLimit) {
                throw new Error(`Daily video limit exceeded for ${modelId} (${dailyLimit}/day).`);
            }
            await prisma.$transaction([
                prisma.userLimits.update({
                    where: { user_id: userId },
                    data: { current_daily_videos: { increment: 1 } }
                }),
                prisma.user.update({
                    where: { id: userId },
                    data: { last_video_generated_at: new Date() }
                })
            ]);
        }
    }
}
