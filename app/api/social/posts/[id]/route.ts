import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { z } from 'zod';
import { socialPostingQueue } from '@/lib/queues';

export const dynamic = 'force-dynamic';

const updatePostSchema = z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    scheduledAt: z.string().datetime().optional().nullable(),
    privacyStatus: z.enum(['PRIVATE', 'UNLISTED', 'PUBLIC']).optional(),
    status: z.enum(['DRAFT', 'SCHEDULED']).optional()
});

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const session = await auth();
        if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const post = await prisma.socialPost.findUnique({
            where: { id, userId: session.user.id },
            include: { project: true }
        });

        if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

        return NextResponse.json(post);
    } catch (error) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const session = await auth();
        if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await request.json();
        const validation = updatePostSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ error: 'Validation Error', details: validation.error.format() }, { status: 400 });
        }

        const data = validation.data;

        const post = await prisma.socialPost.update({
            where: { id, userId: session.user.id },
            data: {
                title: data.title,
                description: data.description,
                privacyStatus: data.privacyStatus,
                scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : (data.scheduledAt === null ? null : undefined),
                status: data.status, // Allow manual status change to DRAFT to cancel schedule
            }
        });

        // Update Job in Queue
        if (data.scheduledAt) {
            // Remove existing job if possible (by ID) and re-add
            // BullMQ relies on Job ID. If we reuse the Post ID as Job ID, we can remove and add.
            const job = await socialPostingQueue.getJob(post.id);
            if (job) {
                await job.remove();
            }

            const delay = new Date(data.scheduledAt).getTime() - Date.now();
            if (delay > 0) {
                await socialPostingQueue.add('publish-video', {
                    postId: post.id,
                    userId: session.user.id
                }, {
                    delay,
                    jobId: post.id
                });
            }
        } else if (data.status === 'DRAFT') {
            // If moved back to draft, remove from queue
            const job = await socialPostingQueue.getJob(post.id);
            if (job) await job.remove();
        }

        return NextResponse.json(post);
    } catch (error) {
        console.error("Error updating post", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const session = await auth();
        if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // Remove from Queue first
        const job = await socialPostingQueue.getJob(id);
        if (job) await job.remove();

        await prisma.socialPost.delete({
            where: { id, userId: session.user.id }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
