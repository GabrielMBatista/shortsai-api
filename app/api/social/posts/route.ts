import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { z } from 'zod';
import { socialPostingQueue, SOCIAL_POSTING_QUEUE_NAME } from '@/lib/queues';

export const dynamic = 'force-dynamic';

const createPostSchema = z.object({
    projectId: z.string().uuid(),
    platform: z.enum(['YOUTUBE', 'TIKTOK', 'INSTAGRAM']),
    title: z.string().optional(),
    description: z.string().optional(),
    scheduledAt: z.string().datetime().optional(), // ISO String
    privacyStatus: z.enum(['PRIVATE', 'UNLISTED', 'PUBLIC']).default('PRIVATE'),
});

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const projectId = searchParams.get('projectId');
        const status = searchParams.get('status');

        const where: any = {
            userId: session.user.id,
        };

        if (projectId) where.projectId = projectId;
        if (status) where.status = status;

        const posts = await prisma.socialPost.findMany({
            where,
            include: {
                project: {
                    select: {
                        generated_title: true,
                        topic: true
                    }
                }
            },
            orderBy: {
                scheduledAt: 'asc', // Show upcoming first
            }
        });

        return NextResponse.json(posts);
    } catch (error) {
        console.error('Error fetching social posts:', error);
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
        const validation = createPostSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ error: 'Validation Error', details: validation.error.format() }, { status: 400 });
        }

        const { projectId, platform, title, description, scheduledAt, privacyStatus } = validation.data;

        // Verify project ownership
        const project = await prisma.project.findUnique({
            where: { id: projectId, user_id: session.user.id }
        });

        if (!project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        // Create the Social Post Record
        const socialPost = await prisma.socialPost.create({
            data: {
                userId: session.user.id,
                projectId,
                platform,
                title: title || project.generated_title || project.topic,
                description: description || project.generated_description,
                privacyStatus,
                scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
                status: scheduledAt ? 'SCHEDULED' : 'DRAFT',
            }
        });

        // Add to Queue if Scheduled immediately or for future
        // TODO: Logic to only queue if scheduled time is close, or use Redis delayed jobs.
        // For now, if it's scheduled, we assume the worker handles the timing check or we use delay.

        if (scheduledAt) {
            const delay = new Date(scheduledAt).getTime() - Date.now();
            if (delay > 0) {
                await socialPostingQueue.add('publish-video', {
                    postId: socialPost.id,
                    userId: session.user.id
                }, {
                    delay: delay,
                    jobId: socialPost.id // One job per post
                });
            }
        }

        return NextResponse.json(socialPost);

    } catch (error) {
        console.error('Error creating social post:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
