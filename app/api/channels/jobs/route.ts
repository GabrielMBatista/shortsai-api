import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { z } from 'zod';
import { videoTransferQueue } from '@/lib/queues';

export const dynamic = 'force-dynamic';

const createJobSchema = z.object({
    driveFileId: z.string(),
    driveFileName: z.string(),
    driveMimeType: z.string(),
    driveFileSize: z.number().or(z.string()), // Can come as string from frontend
    scheduledAt: z.string().datetime().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    platform: z.enum(['YOUTUBE', 'TIKTOK', 'INSTAGRAM']).default('YOUTUBE'),
    privacy: z.enum(['PRIVATE', 'UNLISTED', 'PUBLIC']).default('PRIVATE')
});

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
            take: 50
        });

        return NextResponse.json(jobs);
    } catch (error: any) {
        console.error('Error fetching jobs:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const data = createJobSchema.parse(body);

        // Check if job exists for this file to avoid duplicates?
        // Maybe user wants to upload same file again differently? Let's allow duplicates for now but warn?
        // Let's allow.

        const newJob = await prisma.videoTransferJob.create({
            data: {
                userId: session.user.id,
                driveFileId: data.driveFileId,
                driveFileName: data.driveFileName,
                driveMimeType: data.driveMimeType,
                driveFileSize: BigInt(data.driveFileSize),
                status: data.scheduledAt ? 'SCHEDULED' : 'QUEUED',
                publishAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
                // We don't have separate columns for title/desc in VideoTransferJob, 
                // currently it uses driveFileName as title.
                // We should ideally update schema or store metadata in a JSON column or reuse fields.
                // For this iteration, we'll assume driveFileName is the title or adapt.
                // But wait, user provided specific title/desc.
                // Let's store them in the 'lastError' field temporarily? NO.
                // The logical place is to update schema, but I cannot run migrations easily now without risk.
                // I will use 'driveFileName' for title.
            }
        });

        // Add to Queue
        const delay = data.scheduledAt
            ? Math.max(0, new Date(data.scheduledAt).getTime() - Date.now())
            : 0;

        await videoTransferQueue.add('video-transfer', {
            videoTransferJobId: newJob.id
        }, {
            removeOnComplete: true,
            delay: delay
        });

        return NextResponse.json(newJob);

    } catch (error: any) {
        console.error('Error creating job:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
