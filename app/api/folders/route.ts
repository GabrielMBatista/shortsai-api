import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const createFolderSchema = z.object({
    name: z.string().min(1).max(50),
    parent_id: z.string().optional().nullable(),
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

        const { name, parent_id } = validation.data;
        const user_id = session.user.id;

        const folder = await prisma.folder.create({
            data: {
                name,
                user_id,
                parent_id
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

        const data = await cachedQuery(`api:folders:${user_id}`, async () => {
            const folders = await prisma.folder.findMany({
                where: { user_id },
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

