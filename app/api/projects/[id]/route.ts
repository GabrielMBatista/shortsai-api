import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { auth } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { handleError } from '@/lib/middleware/error-handler';
import { UnauthorizedError, NotFoundError, ForbiddenError } from '@/lib/errors';
// ❌ ZOD REMOVIDO - Validação Zod removida por incompatibilidade com contrato frontend

export const dynamic = 'force-dynamic';

/**
 * GET /api/projects/[id]
 * Retrieve a single project with all its scenes and characters
 * 
 * @param request - Next.js request object
 * @param params - Route parameters (project ID)
 * @returns JSON response with project data
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const requestId = request.headers.get('x-request-id') || randomUUID();
    const startTime = Date.now();

    try {
        const session = await auth();
        if (!session?.user?.id) {
            throw new UnauthorizedError();
        }

        const reqLogger = createRequestLogger(requestId, session.user.id);
        const { id: projectId } = await params;

        reqLogger.debug({ projectId }, 'Fetching project details');

        const project = await prisma.project.findUnique({
            where: { id: projectId },
            select: {
                id: true,
                user_id: true,
                topic: true,
                style: true,
                language: true,
                voice_name: true,
                tts_provider: true,
                video_model: true,
                audio_model: true,
                include_music: true,
                bg_music_prompt: true,
                bg_music_status: true,
                status: true,
                generated_title: true,
                generated_description: true,
                duration_config: true,
                lock_session_id: true,
                lock_expires_at: true,
                is_archived: true,
                tags: true,
                folder_id: true,
                created_at: true,
                updated_at: true,

                scenes: {
                    where: { deleted_at: null },
                    orderBy: { scene_number: 'asc' },
                    select: {
                        id: true,
                        project_id: true,
                        scene_number: true,
                        visual_description: true,
                        narration: true,
                        duration_seconds: true,
                        image_status: true,
                        audio_status: true,
                        sfx_status: true,
                        video_status: true,
                        media_type: true,
                        word_timings: true,
                        error_message: true,
                        image_attempts: true,
                        audio_attempts: true,
                        sfx_attempts: true,
                        video_attempts: true,
                        created_at: true,
                        deleted_at: true,
                        status: true,
                        version: true,
                        characters: {
                            select: {
                                id: true,
                                name: true,
                                description: true,
                                images: true,
                                user_id: true,
                                created_at: true
                            }
                        }
                    }
                },
                ProjectCharacters: {
                    select: {
                        characters: {
                            select: {
                                id: true,
                                name: true,
                                description: true,
                                images: true,
                                user_id: true,
                                created_at: true
                            }
                        }
                    }
                },
            },
        });

        if (!project) {
            throw new NotFoundError('Project', projectId);
        }

        if (project.user_id !== session.user.id) {
            throw new ForbiddenError('You do not have access to this project');
        }

        const mappedProject = {
            ...project,
            ProjectCharacters: undefined,
            characters: project.ProjectCharacters.map(pc => pc.characters)
        };

        const duration = Date.now() - startTime;
        reqLogger.info(
            {
                projectId,
                sceneCount: project.scenes.length,
                duration
            },
            `Project retrieved successfully in ${duration}ms`
        );

        return NextResponse.json(mappedProject, {
            headers: { 'X-Request-ID': requestId },
        });
    } catch (error) {
        return handleError(error, requestId);
    }
}

/**
 * PATCH /api/projects/[id]
 * Update an existing project and its relations
 * 
 * @param request - Next.js request object
 * @param params - Route parameters (project ID)
 * @returns JSON response with updated project data
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const requestId = request.headers.get('x-request-id') || randomUUID();
    const startTime = Date.now();

    try {
        const session = await auth();
        if (!session?.user?.id) {
            throw new UnauthorizedError();
        }

        const reqLogger = createRequestLogger(requestId, session.user.id);
        const { id: projectId } = await params;

        reqLogger.info({ projectId }, 'Updating project');

        // ❌ ZOD REMOVIDO - Apenas parse JSON direto
        const body = await request.json();

        // Check if project exists and belongs to user
        const existingProject = await prisma.project.findUnique({
            where: { id: projectId },
            select: { user_id: true }
        });

        if (!existingProject) {
            throw new NotFoundError('Project', projectId);
        }

        if (existingProject.user_id !== session.user.id) {
            throw new ForbiddenError('You do not have access to this project');
        }

        // Extract characterIds to handle relation update separately
        const { characterIds, ...rest } = body as any;

        const updateData: any = { ...rest };

        // Handle character relations for explicit many-to-many
        if (characterIds && Array.isArray(characterIds)) {
            reqLogger.debug(
                { characterCount: characterIds.length },
                'Updating project characters'
            );

            updateData.ProjectCharacters = {
                deleteMany: {}, // Remove all existing
                create: characterIds.map((charId: string) => ({
                    characters: { connect: { id: charId } }
                }))
            };
        }

        const project = await prisma.project.update({
            where: { id: projectId },
            data: updateData,
            include: {
                ProjectCharacters: { include: { characters: true } },
                scenes: {
                    where: { deleted_at: null },
                    orderBy: { scene_number: 'asc' },
                    include: { characters: true }
                }
            }
        });

        // Invalidate cache if folder or archive status changed
        if (updateData.folder_id !== undefined || updateData.is_archived !== undefined) {
            reqLogger.debug('Invalidating folders cache');
            const { invalidateCache } = await import('@/lib/redis');
            await invalidateCache(`api:folders:${session.user.id}`);
        }

        const mappedProject = {
            ...project,
            ProjectCharacters: undefined,
            characters: project.ProjectCharacters.map(pc => pc.characters)
        };

        const duration = Date.now() - startTime;
        reqLogger.info(
            { projectId, duration },
            `Project updated successfully in ${duration}ms`
        );

        return NextResponse.json(mappedProject, {
            headers: { 'X-Request-ID': requestId },
        });
    } catch (error) {
        return handleError(error, requestId);
    }
}

/**
 * DELETE /api/projects/[id]
 * Delete a project and all its associated assets from storage
 * 
 * @param request - Next.js request object
 * @param params - Route parameters (project ID)
 * @returns JSON response confirming deletion
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const requestId = request.headers.get('x-request-id') || randomUUID();
    const startTime = Date.now();

    try {
        const session = await auth();
        if (!session?.user?.id) {
            throw new UnauthorizedError();
        }

        const reqLogger = createRequestLogger(requestId, session.user.id);
        const { id: projectId } = await params;

        reqLogger.info({ projectId }, 'Deleting project');

        // Fetch project with scenes to get all asset URLs
        const existingProject = await prisma.project.findUnique({
            where: { id: projectId },
            select: {
                user_id: true,
                bg_music_url: true,
                scenes: {
                    where: { deleted_at: null },
                    select: {
                        image_url: true,
                        audio_url: true,
                        video_url: true,
                        sfx_url: true,
                    }
                }
            }
        });

        if (!existingProject) {
            throw new NotFoundError('Project', projectId);
        }

        if (existingProject.user_id !== session.user.id) {
            throw new ForbiddenError('You do not have access to this project');
        }

        reqLogger.debug(
            { sceneCount: existingProject.scenes.length },
            'Deleting project assets from storage'
        );

        // Delete all assets from R2
        const { deleteFromR2 } = await import('@/lib/storage');

        // Delete scene assets
        const assetDeletions = [];
        for (const scene of existingProject.scenes) {
            assetDeletions.push(
                deleteFromR2(scene.image_url),
                deleteFromR2(scene.audio_url),
                deleteFromR2(scene.video_url),
                deleteFromR2(scene.sfx_url)
            );
        }

        // Delete background music
        assetDeletions.push(deleteFromR2(existingProject.bg_music_url));

        // Execute all deletions in parallel
        await Promise.all(assetDeletions);

        reqLogger.debug('Assets deleted, removing from database');

        // Now delete from database
        await prisma.project.delete({
            where: { id: projectId },
        });

        // Invalidate folders cache
        const { invalidateCache } = await import('@/lib/redis');
        await invalidateCache(`api:folders:${session.user.id}`);

        const duration = Date.now() - startTime;
        reqLogger.info(
            {
                projectId,
                assetsDeleted: assetDeletions.length,
                duration
            },
            `Project deleted successfully in ${duration}ms`
        );

        return NextResponse.json(
            { success: true },
            { headers: { 'X-Request-ID': requestId } }
        );
    } catch (error) {
        return handleError(error, requestId);
    }
}
