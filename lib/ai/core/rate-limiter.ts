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

    static async checkVideoRateLimits(userId: string) {
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
    }
}
