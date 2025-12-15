import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { handleError } from '@/lib/middleware/error-handler';
import { UnauthorizedError, BadRequestError } from '@/lib/errors';
import { validateRequest } from '@/lib/validation';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

// Schema inline (temporário - deveria estar em channel.schema.ts)
const importChannelSchema = z.object({
    youtubeChannelId: z.string().min(1),
    googleAccountId: z.string(),
    name: z.string().min(1).optional(),
    description: z.string().optional()
});

/**
 * POST /api/channels/import
 * Import a YouTube channel
 */
export async function POST(request: NextRequest) {
    const requestId = request.headers.get('x-request-id') || randomUUID();
    const startTime = Date.now();

    try {
        const session = await auth();
        if (!session?.user?.id) throw new UnauthorizedError();

        const reqLogger = createRequestLogger(requestId, session.user.id);
        reqLogger.info('Importing YouTube channel');

        const body = await validateRequest(request, importChannelSchema);
        const { youtubeChannelId, googleAccountId, name, description } = body;

        const channel = await prisma.channel.upsert({
            where: {
                userId_youtubeChannelId: {
                    userId: session.user.id,
                    youtubeChannelId
                }
            },
            update: {
                name: name || undefined,
                description: description || undefined,
                lastSyncedAt: new Date()
            },
            create: {
                youtubeChannelId,
                googleAccountId,
                userId: session.user.id,
                name: name || youtubeChannelId,
                description: description || null,
                isActive: true
            }
        });

        const duration = Date.now() - startTime;
        reqLogger.info(
            { channelId: channel.id, youtubeChannelId, duration },
            `Channel imported in ${duration}ms`
        );

        return NextResponse.json(channel, {
            status: 201,
            headers: { 'X-Request-ID': requestId }
        });
    } catch (error) {
        return handleError(error, requestId);
    }
}
