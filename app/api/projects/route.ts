import { prisma } from '@/lib/prisma';
import { broadcastAdminUpdate } from '@/lib/sse/sse-service';
import { NextResponse } from 'next/server';
import { Prisma, Character } from '@prisma/client';
import { auth } from '@/lib/auth';
import { createProjectSchema } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();

        // Validate input using Zod
        const validation = createProjectSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({
                error: 'Validation Error',
                details: validation.error.format()
            }, { status: 400 });
        }

        const {
            topic,
            style,
            language,
            voice_name,
            tts_provider,
            reference_image_url,
            characterIds,
            include_music,
            bg_music_prompt,
            duration_config,
        } = validation.data;

        const user_id = session.user.id;

        // --- LIMIT CHECK ---
        const user = await prisma.user.findUnique({
            where: { id: user_id },
            include: { user_limits: true }
        });

        if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

        let limits = user.user_limits;
        if (!limits) {
            limits = await prisma.userLimits.create({ data: { user_id } });
        }

        const today = new Date();
        const lastReset = new Date(limits.last_daily_reset);
        const isNewDay = today.getDate() !== lastReset.getDate() || today.getMonth() !== lastReset.getMonth();

        if (isNewDay) {
            // Reset daily counters
            limits = await prisma.userLimits.update({
                where: { user_id },
                data: {
                    current_daily_requests: 0,
                    current_daily_videos: 0,
                    last_daily_reset: today
                }
            });
        }

        // Check Limit for FREE users
        const isFree = user.subscription_plan === 'FREE' || user.tier === 'free';
        if (isFree) {
            const limit = limits.daily_videos_limit; // Default is 1 in schema
            if (limits.current_daily_videos >= limit) {
                return NextResponse.json({
                    error: 'Daily video limit reached',
                    details: 'Free accounts are limited to 1 video per day. Upgrade to Pro for more.'
                }, { status: 403 });
            }
        }

        // Increment Video Count
        await prisma.userLimits.update({
            where: { user_id },
            data: {
                current_daily_videos: { increment: 1 },
                current_videos_used: { increment: 1 }
            }
        });
        // -------------------

        // If characterIds provided, fetch character data and create snapshot
        let reference_characters_snapshot: Prisma.InputJsonValue | undefined;
        if (characterIds && Array.isArray(characterIds) && characterIds.length > 0) {
            const characters = await prisma.character.findMany({
                where: {
                    id: { in: characterIds },
                    user_id, // Ensure characters belong to the user
                },
            });

            // Create snapshot in the format expected by frontend
            reference_characters_snapshot = characters.map((char: Character) => ({
                id: char.id,
                name: char.name,
                description: char.description,
                images: char.images,
            })) as Prisma.InputJsonValue;
        }

        const project = await prisma.project.create({
            data: {
                user_id,
                topic,
                style,
                language,
                voice_name,
                tts_provider,
                reference_image_url,
                // We still support snapshot for legacy/backup, but primary link is relation
                ...(reference_characters_snapshot && { reference_characters_snapshot }),
                include_music,
                bg_music_prompt,
                bg_music_status: include_music ? 'pending' : null,
                duration_config: duration_config || Prisma.JsonNull,
                status: 'draft',
                characters: {
                    connect: characterIds?.map((id: string) => ({ id })) || [],
                },
            },
            include: { characters: true },
        });

        // Broadcast to admin dashboard
        broadcastAdminUpdate('PROJECT_CREATED', project);

        return NextResponse.json(project);
    } catch (error: any) {
        console.error('Error creating project:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const user_id = session.user.id;
        const limitParam = searchParams.get('limit');
        const offsetParam = searchParams.get('offset');

        const limit = limitParam ? parseInt(limitParam) : undefined;
        const offset = offsetParam ? parseInt(offsetParam) : undefined;

        const folderIdParam = searchParams.get('folder_id');
        const isArchivedParam = searchParams.get('is_archived');

        const where: any = { user_id };

        if (folderIdParam === 'root') {
            where.folder_id = null;
        } else if (folderIdParam) {
            where.folder_id = folderIdParam;
        }

        if (isArchivedParam !== null) {
            where.is_archived = isArchivedParam === 'true';
        } else {
            // Default behavior: if not specified, usually we might want to show unarchived?
            // But existing frontend logic sends is_archived=false explicitly for default view.
            // If the frontend doesn't send it, we might want to default to false to hide archived projects?
            // However, let's stick to what was requested. If param is missing, don't filter (or let frontend handle it).
            // Actually, looking at previous frontend code, it was filtering client side.
            // Best practice: Default to is_archived: false if not specified? 
            // Let's rely on the explicit param from frontend for now to avoid breaking changes if 'all' is needed.
            // But wait, the frontend sends `is_archived=${isArchived}` which is boolean.
        }

        const [projects, total] = await Promise.all([
            prisma.project.findMany({
                where,
                orderBy: { created_at: 'desc' },
                take: limit,
                skip: offset,
                select: {
                    id: true,
                    user_id: true,
                    topic: true,
                    style: true,
                    language: true,
                    voice_name: true,
                    tts_provider: true,
                    created_at: true,
                    generated_title: true,
                    generated_description: true,
                    status: true,
                    is_archived: true,
                    tags: true,
                    folder_id: true,
                    scenes: {
                        where: { deleted_at: null },
                        select: {
                            id: true,
                            scene_number: true,
                            image_status: true,
                            audio_status: true,
                            // video_status and others if needed for status display
                            video_status: true, 
                            media_type: true
                        },
                        orderBy: { scene_number: 'asc' }
                    }
                }
            }),
            prisma.project.count({ where })
        ]);

        // If pagination is used, return wrapper. If not, return array for backward compatibility (or just always return wrapper if we update frontend simultaneously)
        // The user explicitly asked for optimization, so let's standardise on the wrapper if limit is present.
        // However, to be safe and consistent, let's check if limit was requested.

        if (limit !== undefined) {
            return NextResponse.json({
                data: projects,
                meta: {
                    total,
                    limit,
                    offset: offset || 0
                }
            });
        }

        return NextResponse.json(projects);
    } catch (error: any) {
        console.error('Error fetching projects:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
