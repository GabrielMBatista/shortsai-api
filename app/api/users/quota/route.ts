import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

import { cachedQuery } from '@/lib/redis';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const user_id = searchParams.get('user_id');

        if (!user_id) {
            return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
        }

        const data = await cachedQuery(`api:quota:${user_id}`, async () => {
            // Fetch user with limits
            const user = await prisma.user.findUnique({
                where: { id: user_id },
                include: { user_limits: true },
            });

            if (!user) {
                return null;
            }

            // If user_limits don't exist, create default ones
            let userLimits = user.user_limits;
            if (!userLimits) {
                userLimits = await prisma.userLimits.create({
                    data: { user_id },
                });
            }

            // Map tier to plan name for response
            const planMap: Record<string, string> = {
                free: 'free',
                pro: 'pro',
                enterprise: 'enterprise',
            };

            return {
                plan: planMap[user.tier] || 'free',
                limits: {
                    maxVideos: userLimits.monthly_videos_limit,
                    maxTTSMinutes: userLimits.monthly_minutes_tts,
                    maxImages: userLimits.monthly_images_limit,
                    maxDailyVideos: userLimits.daily_videos_limit,
                },
                used: {
                    currentVideos: userLimits.current_videos_used,
                    currentTTSMinutes: parseFloat(userLimits.current_minutes_tts_used.toString()),
                    currentImages: userLimits.current_images_used,
                    currentDailyVideos: userLimits.current_daily_videos,
                },
                lastResetDate: userLimits.last_reset_date,
            };
        }, 60); // Cache for 60 seconds

        if (!data) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Error fetching user quota:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error', details: error }, { status: 500 });
    }
}
