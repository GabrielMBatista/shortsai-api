import { prisma } from '@/lib/prisma';
import { broadcastAdminUpdate } from '@/lib/sse/sse-service';
import { NextRequest, NextResponse } from 'next/server';
import { Prisma, Character } from '@prisma/client';
import { randomUUID } from 'crypto';
import { auth } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { handleError } from '@/lib/middleware/error-handler';
import { UnauthorizedError, NotFoundError, RateLimitError } from '@/lib/errors';
import { validateRequest } from '@/lib/validation';
// Import direto do arquivo específico
import { createProjectSchema } from '@/lib/schemas/project.schema';

export const dynamic = 'force-dynamic';

/**
 * POST /api/projects
 * Create a new project with rate limiting and validation
 */
export async function POST(request: NextRequest) {
    const requestId = request.headers.get('x-request-id') || randomUUID();
    const startTime = Date.now();

    try {
        const session = await auth();
        if (!session?.user?.id) {
            throw new UnauthorizedError();
        }

        const reqLogger = createRequestLogger(requestId, session.user.id);
        reqLogger.info('Creating new project');

        const body = await validateRequest(request, createProjectSchema) as any;
        const {
            topic, style, language, voice_name, tts_provider, reference_image_url,
            characterIds, include_music, bg_music_prompt, duration_config, folder_id,
            generated_title, generated_description, generated_shorts_hashtags,
            generated_tiktok_text, generated_tiktok_hashtags, script_metadata,
            channel_id, persona_id,
        } = body;

        const user_id = session.user.id;

        // Resolve persona
        let effectivePersonaId = persona_id;
        let personaVersion = null;

        if (channel_id && !persona_id) {
            const channel = await prisma.channel.findUnique({
                where: { id: channel_id },
                include: { persona: true }
            });
            if (channel?.personaId) {
                effectivePersonaId = channel.personaId;
                personaVersion = channel.persona?.version;
            }
        } else if (persona_id) {
            const persona = await prisma.persona.findUnique({ where: { id: persona_id } });
            personaVersion = persona?.version;
        }

        // Check limits
        const user = await prisma.user.findUnique({
            where: { id: user_id },
            include: { user_limits: true }
        });

        if (!user) throw new NotFoundError('User', user_id);

        let limits = user.user_limits;
        if (!limits) {
            limits = await prisma.userLimits.create({ data: { user_id } });
        }

        const today = new Date();
        const lastReset = new Date(limits.last_daily_reset);
        const isNewDay = today.getDate() !== lastReset.getDate() ||
            today.getMonth() !== lastReset.getMonth();

        if (isNewDay) {
            limits = await prisma.userLimits.update({
                where: { user_id },
                data: {
                    current_daily_requests: 0,
                    current_daily_videos: 0,
                    last_daily_reset: today
                }
            });
        }

        const isFree = user.subscription_plan === 'FREE' || user.tier === 'free';
        if (isFree && limits.current_daily_videos >= limits.daily_videos_limit) {
            throw new RateLimitError(86400);
        }

        await prisma.userLimits.update({
            where: { user_id },
            data: {
                current_daily_videos: { increment: 1 },
                current_videos_used: { increment: 1 }
            }
        });

        // Character snapshot
        let reference_characters_snapshot: Prisma.InputJsonValue | undefined;
        if (characterIds?.length > 0) {
            const characters = await prisma.character.findMany({
                where: { id: { in: characterIds }, user_id },
            });
            reference_characters_snapshot = characters.map((char: Character) => ({
                id: char.id, name: char.name, description: char.description, images: char.images,
            })) as Prisma.InputJsonValue;
        }

        const project = await prisma.project.create({
            data: {
                user_id, topic, style, language, voice_name, tts_provider, reference_image_url,
                ...(reference_characters_snapshot && { reference_characters_snapshot }),
                include_music, bg_music_prompt,
                bg_music_status: include_music ? 'pending' : null,
                duration_config: duration_config || Prisma.JsonNull,
                status: 'draft', folder_id, generated_title, generated_description,
                generated_shorts_hashtags: generated_shorts_hashtags || [],
                generated_tiktok_text, generated_tiktok_hashtags: generated_tiktok_hashtags || [],
                script_metadata: script_metadata || Prisma.JsonNull,
                channel_id: channel_id || null, persona_id: effectivePersonaId || null,
                persona_version: personaVersion,
                ProjectCharacters: {
                    create: characterIds?.map((id: string) => ({ characters: { connect: { id } } })) || []
                }
            },
            include: {
                ProjectCharacters: { include: { characters: true } },
                channel: true,
                persona: { select: { id: true, name: true, type: true, category: true } }
            },
        });

        const mappedProject = {
            ...project,
            ProjectCharacters: undefined,
            characters: project.ProjectCharacters.map(pc => pc.characters)
        };

        const duration = Date.now() - startTime;
        reqLogger.info({ projectId: project.id, duration }, `Project created in ${duration}ms`);

        broadcastAdminUpdate('PROJECT_CREATED', mappedProject);
        return NextResponse.json(mappedProject, { headers: { 'X-Request-ID': requestId } });
    } catch (error) {
        return handleError(error, requestId);
    }
}

/**
 * GET /api/projects
 * List projects for authenticated user
 */
export async function GET(request: NextRequest) {
    const requestId = request.headers.get('x-request-id') || randomUUID();
    const startTime = Date.now();

    try {
        const session = await auth();
        if (!session?.user?.id) throw new UnauthorizedError();

        const reqLogger = createRequestLogger(requestId, session.user.id);
        const { searchParams } = new URL(request.url);

        const user_id = session.user.id;
        const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined;
        const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : undefined;
        const folderIdParam = searchParams.get('folder_id');
        const isArchivedParam = searchParams.get('is_archived');

        const where: any = { user_id };
        if (folderIdParam === 'root') where.folder_id = null;
        else if (folderIdParam) where.folder_id = folderIdParam;
        if (isArchivedParam !== null) where.is_archived = isArchivedParam === 'true';

        const [projects, total] = await Promise.all([
            prisma.project.findMany({
                where, orderBy: { created_at: 'desc' }, take: limit, skip: offset,
                select: {
                    id: true, user_id: true, topic: true, style: true, language: true,
                    voice_name: true, tts_provider: true, created_at: true,
                    generated_title: true, generated_description: true,
                    generated_shorts_hashtags: true, generated_tiktok_text: true,
                    generated_tiktok_hashtags: true, script_metadata: true,
                    status: true, is_archived: true, tags: true, folder_id: true,
                    scenes: {
                        where: { deleted_at: null },
                        select: {
                            id: true, scene_number: true, image_status: true,
                            audio_status: true, video_status: true, media_type: true, video_model: true
                        },
                        orderBy: { scene_number: 'asc' }
                    },
                    ProjectCharacters: {
                        select: {
                            characters: {
                                select: { id: true, name: true, images: true, description: true }
                            }
                        }
                    }
                }
            }),
            prisma.project.count({ where })
        ]);

        const mappedProjects = projects.map(p => ({
            ...p, ProjectCharacters: undefined,
            characters: p.ProjectCharacters.map(pc => pc.characters)
        }));

        const duration = Date.now() - startTime;
        reqLogger.info({ projectCount: projects.length, total, duration }, `Projects retrieved in ${duration}ms`);

        if (limit !== undefined) {
            return NextResponse.json(
                { data: mappedProjects, meta: { total, limit, offset: offset || 0 } },
                { headers: { 'X-Request-ID': requestId } }
            );
        }

        return NextResponse.json(mappedProjects, { headers: { 'X-Request-ID': requestId } });
    } catch (error) {
        return handleError(error, requestId);
    }
}
