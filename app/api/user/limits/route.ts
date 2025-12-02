import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
    const userId = req.headers.get('x-user-id') || req.nextUrl.searchParams.get('userId');

    if (!userId) {
        return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    try {
        let limits = await prisma.userLimits.findUnique({
            where: { user_id: userId }
        });

        if (!limits) {
            // Create default limits
            limits = await prisma.userLimits.create({
                data: {
                    user_id: userId,
                    monthly_videos_limit: 5,
                    monthly_minutes_tts: 10,
                    monthly_images_limit: 50
                }
            });
        }

        return NextResponse.json(limits);
    } catch (error: any) {
        console.error('Error fetching user limits:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
