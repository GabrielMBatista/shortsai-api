import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createRequestLogger } from '@/lib/logger';
import { handleError } from '@/lib/middleware/error-handler';
import { BadRequestError, NotFoundError, UnauthorizedError } from '@/lib/errors';
// ❌ ZOD REMOVIDO - Validação Zod removida por incompatibilidade com contrato frontend

export const dynamic = 'force-dynamic';

/**
 * POST /api/users
 * Create or update a user (upsert based on email)
 */
export async function POST(request: NextRequest) {
    const requestId = request.headers.get('x-request-id') || randomUUID();
    const startTime = Date.now();

    try {
        const reqLogger = createRequestLogger(requestId);
        reqLogger.info('Creating/updating user');

        // ❌ ZOD REMOVIDO - Parse JSON direto
        const body = await request.json();
        const { email, name, avatar_url, google_id } = body;

        if (!email) {
            throw new BadRequestError('Email is required');
        }

        reqLogger.debug({ email }, 'Upserting user');

        const user = await prisma.user.upsert({
            where: { email },
            update: { name, avatar_url, google_id },
            create: { email, name, avatar_url, google_id },
        });

        const duration = Date.now() - startTime;
        reqLogger.info({ userId: user.id, duration }, `User upserted in ${duration}ms`);

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
 */
export async function GET(request: NextRequest) {
    const requestId = request.headers.get('x-request-id') || randomUUID();
    const startTime = Date.now();

    try {
        const reqLogger = createRequestLogger(requestId);
        const { searchParams } = new URL(request.url);

        // ❌ ZOD REMOVIDO - Query params diretos
        const email = searchParams.get('email');
        const user_id = searchParams.get('user_id');

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
            reqLogger.info({ userId: user.id, duration }, `User retrieved in ${duration}ms`);

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
                throw new NotFoundError('User');
            }

            const duration = Date.now() - startTime;
            reqLogger.info({ userId: user.id, duration }, `User retrieved in ${duration}ms`);

            return NextResponse.json(user, {
                headers: { 'X-Request-ID': requestId },
            });
        }

        // List all users (limited)
        reqLogger.debug('Fetching all users');

        const users = await prisma.user.findMany({
            take: 100,
            select: {
                id: true,
                email: true,
                name: true,
                avatar_url: true,
                created_at: true,
                subscription_plan: true,
                tier: true,
            },
        });

        const duration = Date.now() - startTime;
        reqLogger.info({ userCount: users.length, duration }, `Users list retrieved in ${duration}ms`);

        return NextResponse.json(users, {
            headers: { 'X-Request-ID': requestId },
        });
    } catch (error) {
        return handleError(error, requestId);
    }
}
