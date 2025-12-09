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

    static async acquireVideoSlot(userId: string) {
        const cooldownMs = 40000;

        while (true) {
            const threshold = new Date(Date.now() - cooldownMs);

            // Atomic update: only succeeds if enough time has passed
            const result = await prisma.user.updateMany({
                where: {
                    id: userId,
                    OR: [
                        { last_video_generated_at: null },
                        { last_video_generated_at: { lt: threshold } }
                    ]
                },
                data: {
                    last_video_generated_at: new Date()
                }
            });

            // Success! Slot acquired
            if (result.count > 0) {
                return;
            }

            // Failed to acquire slot - calculate wait time
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { last_video_generated_at: true }
            });

            if (user?.last_video_generated_at) {
                const diff = Date.now() - user.last_video_generated_at.getTime();
                const waitMs = cooldownMs - diff;

                if (waitMs > 0) {
                    console.log(`[RateLimiter] User ${userId} waiting ${Math.ceil(waitMs / 1000)}s for video cooldown...`);
                    // Wait for the cooldown period, then retry
                    await new Promise(resolve => setTimeout(resolve, waitMs + 100)); // +100ms buffer
                    continue; // Retry the atomic update
                }
            }

            // Shouldn't reach here, but if we do, just return
            return;
        }
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

        // Note: Cooldown is now handled by acquireVideoSlot called before this

        // 2. Check Daily Limits (Database - UserLimits Table)
        const limits = await prisma.userLimits.findUnique({ where: { user_id: userId } });
        if (!limits) {
            await prisma.userLimits.create({ data: { user_id: userId } });
            return;
        }

        const today = new Date();
        const lastReset = new Date(limits.last_daily_reset);
        const isNewDay = today.getDate() !== lastReset.getDate() || today.getMonth() !== lastReset.getMonth();

        // 3. Determine Limit based on User Plan
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { plan: true }
        });

        let planDailyVideoLimit = 0;
        let planMonthlyVideoLimit = 0;

        if (user?.plan) {
            planDailyVideoLimit = user.plan.daily_videos_limit;
            planMonthlyVideoLimit = user.plan.monthly_videos_limit;
        }
        else if (user?.subscription_plan === 'PRO') {
            const proPlan = await prisma.plan.findUnique({ where: { slug: 'pro' } });
            if (proPlan) {
                planDailyVideoLimit = proPlan.daily_videos_limit;
                planMonthlyVideoLimit = proPlan.monthly_videos_limit;
            } else {
                planDailyVideoLimit = 500;
                planMonthlyVideoLimit = 100;
            }
        }
        else if (user?.subscription_plan === 'FREE') {
            const freePlan = await prisma.plan.findUnique({ where: { slug: 'free' } });
            if (freePlan) {
                planDailyVideoLimit = freePlan.daily_videos_limit;
                planMonthlyVideoLimit = freePlan.monthly_videos_limit;
            } else {
                planDailyVideoLimit = 2;
                planMonthlyVideoLimit = 5;
            }
        }

        if (planDailyVideoLimit === 0 && planMonthlyVideoLimit === 0) {
            throw new Error("Access Denied: No active subscription plan found.");
        }

        if (isNewDay) {
            await prisma.userLimits.update({
                where: { user_id: userId },
                data: {
                    current_daily_requests: 0,
                    current_daily_videos: 1,
                    last_daily_reset: today
                }
            });
        } else {
            if (limits.current_daily_videos >= planDailyVideoLimit) {
                throw new Error(`Daily video limit exceeded for your plan (${planDailyVideoLimit}/day). Upgrade to Pro for more.`);
            }

            if (limits.current_videos_used >= planMonthlyVideoLimit) {
                throw new Error(`Monthly video limit exceeded for your plan (${planMonthlyVideoLimit}/month). Upgrade to Pro for more.`);
            }

            await prisma.userLimits.update({
                where: { user_id: userId },
                data: {
                    current_daily_videos: { increment: 1 },
                    current_videos_used: { increment: 1 }
                }
            });
        }
    }
}
