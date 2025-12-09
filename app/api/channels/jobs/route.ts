import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user_id = session.user.id;

        const jobs = await prisma.videoTransferJob.findMany({
            where: {
                userId: user_id
            },
            orderBy: {
                createdAt: 'desc'
            },
            take: 50 // Limit to last 50 jobs
        });

        return NextResponse.json(jobs);
    } catch (error: any) {
        console.error('Error fetching jobs:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
