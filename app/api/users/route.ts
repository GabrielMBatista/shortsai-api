import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createRequestLogger } from '@/lib/logger';
import { handleError } from '@/lib/middleware/error-handler';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { validateRequest, validateQueryParams } from '@/lib/validation';
import { createUserSchema, userQuerySchema } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

/**
 * POST /api/users
 * Create or update a user (upsert based on email)
 * 
 * @param request - Next.js request object
 * @returns JSON response with user data
 */
export async function POST(request: NextRequest) {
    const requestId = request.headers.get('x-request-id') || randomUUID();
    const startTime = Date.now();

    try {
        const reqLogger = createRequestLogger(requestId);
        reqLogger.info('Creating/updating user');

        // Validate request body
        const body = await validateRequest(request, createUserSchema);
        const { email, name, avatar_url, google_id } = body;

        reqLogger.debug({ email }, 'Upserting user');

        const user = await prisma.user.upsert({
            where: { email },
            update: {
                name,
                avatar_url,
                google_id,
            },
            create: {
                email,
                name,
                avatar_url,
                google_id,
            },
        });

        const duration = Date.now() - startTime;
        reqLogger.info(
            {
                userId: user.id,
                email: user.email,
                duration
            },
            `User upserted successfully in ${duration}ms`
        );

        return NextResponse.json(user, {
            headers: { 'X-Request-ID': requestId },
        });
    } catch (error) {
        return handleError(error, requestId);
    }
}

/**
 * GET /api/users
 * Retrieve users - single user by email or all users
 * 
 * @param request - Next.js request object
 * @returns JSON response with user(s) data
 */
export async function GET(request: NextRequest) {
    const requestId = request.headers.get('x-request-id') || randomUUID();
    const startTime = Date.now();

    try {
        const reqLogger = createRequestLogger(requestId);
        const { searchParams } = new URL(request.url);

        // Validate query parameters
        const params = validateQueryParams(searchParams, userQuerySchema);
        const { email, user_id } = params;

        if (email) {
            reqLogger.debug({ email }, 'Fetching user by email');

            const user = await prisma.user.findUnique({
                where: { email },
                include: { api_keys: true },
            });

            if (!user) {
                throw new NotFoundError('User');
            }

            const duration = Date.now() - startTime;
            reqLogger.info(
                { userId: user.id, duration },
                `User retrieved in ${duration}ms`
            );

            return NextResponse.json(user, {
                headers: { 'X-Request-ID': requestId },
            });
        }

        if (user_id) {
            reqLogger.debug({ user_id }, 'Fetching user by ID');

            const user = await prisma.user.findUnique({
                where: { id: user_id },
                include: { api_keys: true },
            });

            if (!user) {
                throw new NotFoundError('User', user_id);
            }

            const duration = Date.now() - startTime;
            reqLogger.info(
                { userId: user.id, duration },
                `User retrieved in ${duration}ms`
            );

            return NextResponse.json(user, {
                headers: { 'X-Request-ID': requestId },
            });
        }

        // Fetch all users (consider adding pagination for production)
        reqLogger.debug('Fetching all users');

        const users = await prisma.user.findMany({
            select: {
                id: true,
                email: true,
                name: true,
                avatar_url: true,
                subscription_plan: true,
                role: true,
                is_blocked: true,
                created_at: true,
            },
            take: 100, // Limit to prevent performance issues
        });

        const duration = Date.now() - startTime;
        reqLogger.info(
            { userCount: users.length, duration },
            `Users list retrieved in ${duration}ms`
        );

        return NextResponse.json(users, {
            headers: { 'X-Request-ID': requestId },
        });
    } catch (error) {
        return handleError(error, requestId);
    }
}
