import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const createFolderSchema = z.object({
    name: z.string().min(1).max(50),
    parent_id: z.string().optional().nullable(),
    channel_id: z.string().optional().nullable(), // 🆕 Channel-first hierarchy
});

import { cachedQuery, invalidateCache } from '@/lib/redis';

// ... imports

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const validation = createFolderSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ error: 'Validation Error', details: validation.error.format() }, { status: 400 });
        }

        const { name, parent_id, channel_id } = validation.data;
        const user_id = session.user.id;

        // 🆕 Validate channel ownership if channel_id provided
        if (channel_id) {
            const channel = await prisma.channel.findUnique({
                where: { id: channel_id }
            });

            if (!channel || channel.userId !== user_id) {
                return NextResponse.json(
                    { error: 'Channel not found or unauthorized' },
                    { status: 403 }
                );
            }
        }

        const folder = await prisma.folder.create({
            data: {
                name,
                user_id,
                parent_id,
                channel_id // 🆕 Link to channel
            },
        });

        // Invalidate fetching cache
        await invalidateCache(`api:folders:${user_id}`);

        return NextResponse.json(folder);
    } catch (error: any) {
        // ... (error handling remains same)
        // Handle unique constraint violation
        if (error.code === 'P2002') {
            return NextResponse.json({ error: 'Folder with this name already exists' }, { status: 409 });
        }
        console.error('Error creating folder:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user_id = session.user.id;
        const { searchParams } = new URL(request.url);
        const channelId = searchParams.get('channel_id');

        // 🆕 Dynamic cache key based on filter
        const cacheKey = channelId
            ? `api:folders:${user_id}:channel:${channelId}`
            : `api:folders:${user_id}`;

        const data = await cachedQuery(cacheKey, async () => {
            // 🆕 Build where clause based on channel filter
            const where: any = { user_id };

            if (channelId === 'null' || channelId === '') {
                // Get only global folders (no channel)
                where.channel_id = null;
            } else if (channelId) {
                // Get folders for specific channel
                where.channel_id = channelId;
            }
            // If no channelId param, return ALL folders (current behavior)

            const folders = await prisma.folder.findMany({
                where,
                orderBy: { name: 'asc' },
                include: {
                    _count: {
                        select: {
                            projects: {
                                where: { is_archived: false }
                            }
                        }
                    }
                }
            });

            const rootCount = await prisma.project.count({
                where: {
                    user_id,
                    folder_id: null,
                    is_archived: false
                }
            });

            return { folders, rootCount };
        }, 300); // 5 minutes cache

        return NextResponse.json(data);
    } catch (error: any) {
        // ...
        console.error('CRITICAL ERROR in GET /api/folders:', error);
        if (error instanceof Error) {
            console.error('Stack:', error.stack);
            console.error('Message:', error.message);
        }
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}

