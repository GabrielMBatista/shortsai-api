
import { prisma } from '@/lib/prisma';

export class PlanService {
    /**
     * Syncs a user's UserLimits with their assigned Plan.
     * Should be called whenever a user's plan changes (e.g. after Stripe webhook).
     */
    static async syncUserLimits(userId: string) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { plan: true }
        });

        if (!user || !user.plan) {
            console.warn(`[PlanService] User ${userId} has no plan assigned. Skipping sync.`);
            return;
        }

        const plan = user.plan;

        await prisma.userLimits.upsert({
            where: { user_id: userId },
            update: {
                monthly_images_limit: plan.monthly_images_limit,
                monthly_videos_limit: plan.monthly_videos_limit,
                monthly_minutes_tts: plan.monthly_minutes_tts,
                daily_requests_limit: plan.daily_requests_limit,
                daily_videos_limit: plan.daily_videos_limit
            },
            create: {
                user_id: userId,
                monthly_images_limit: plan.monthly_images_limit,
                monthly_videos_limit: plan.monthly_videos_limit,
                monthly_minutes_tts: plan.monthly_minutes_tts,
                daily_requests_limit: plan.daily_requests_limit,
                daily_videos_limit: plan.daily_videos_limit
            }
        });

        console.log(`[PlanService] Synced limits for user ${userId} to plan ${plan.name}`);
    }

    /**
     * Assigns a plan to a user and syncs limits.
     */
    static async assignPlan(userId: string, planSlug: string) {
        const plan = await prisma.plan.findUnique({ where: { slug: planSlug } });
        if (!plan) throw new Error(`Plan ${planSlug} not found`);

        await prisma.user.update({
            where: { id: userId },
            data: { plan_id: plan.id }
        });

        await this.syncUserLimits(userId);
    }
}
