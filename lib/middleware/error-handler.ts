import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AppError, ValidationError, RateLimitError } from '@/lib/errors';
import { logger } from '@/lib/logger';

/**
 * Global error handler for Next.js API routes
 * Converts errors into consistent JSON responses
 * 
 * @param error - Error to handle
 * @param requestId - Optional request ID for tracking
 * @returns NextResponse with error details
 */
export function handleError(error: unknown, requestId?: string): NextResponse {
    const reqLogger = logger.child({ requestId });

    // Zod Validation Error
    if (error instanceof ZodError) {
        reqLogger.warn({ error: error.errors }, 'Validation error');

        return NextResponse.json(
            {
                error: 'Validation failed',
                code: 'VALIDATION_ERROR',
                details: error.errors.map(err => ({
                    path: err.path.join('.'),
                    message: err.message,
                    code: err.code,
                })),
            },
            {
                status: 422,
                headers: {
                    'Content-Type': 'application/json',
                    ...(requestId && { 'X-Request-ID': requestId }),
                },
            }
        );
    }

    // Custom Application Errors
    if (error instanceof AppError) {
        const logLevel = error.statusCode >= 500 ? 'error' : 'warn';

        reqLogger[logLevel](
            {
                error: error.message,
                statusCode: error.statusCode,
                code: error.code,
                details: error.details,
            },
            error.message
        );

        return NextResponse.json(
            error.toJSON(),
            {
                status: error.statusCode,
                headers: {
                    'Content-Type': 'application/json',
                    ...(requestId && { 'X-Request-ID': requestId }),
                    ...(error instanceof RateLimitError && {
                        'Retry-After': String(error.retryAfter),
                    }),
                },
            }
        );
    }

    // Prisma Errors
    if (error && typeof error === 'object' && 'code' in error) {
        const prismaError = error as any;

        // P2002: Unique constraint violation
        if (prismaError.code === 'P2002') {
            reqLogger.warn({ error: prismaError }, 'Unique constraint violation');

            return NextResponse.json(
                {
                    error: 'A record with this value already exists',
                    code: 'DUPLICATE_ENTRY',
                    details: {
                        fields: prismaError.meta?.target,
                    },
                },
                {
                    status: 409,
                    headers: {
                        ...(requestId && { 'X-Request-ID': requestId }),
                    },
                }
            );
        }

        // P2025: Record not found
        if (prismaError.code === 'P2025') {
            reqLogger.warn({ error: prismaError }, 'Record not found');

            return NextResponse.json(
                {
                    error: 'Record not found',
                    code: 'NOT_FOUND',
                },
                {
                    status: 404,
                    headers: {
                        ...(requestId && { 'X-Request-ID': requestId }),
                    },
                }
            );
        }

        // Other Prisma errors
        reqLogger.error({ error: prismaError }, 'Database error');

        return NextResponse.json(
            {
                error: 'Database error',
                code: 'DATABASE_ERROR',
            },
            {
                status: 500,
                headers: {
                    ...(requestId && { 'X-Request-ID': requestId }),
                },
            }
        );
    }

    // Unexpected/Unknown Errors
    reqLogger.error({ error }, 'Unexpected error');

    const isDevelopment = process.env.NODE_ENV === 'development';

    return NextResponse.json(
        {
            error: 'Internal server error',
            code: 'INTERNAL_ERROR',
            // Only expose error details in development
            ...(isDevelopment && error instanceof Error && {
                details: {
                    message: error.message,
                    stack: error.stack?.split('\n').slice(0, 5),
                },
            }),
        },
        {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                ...(requestId && { 'X-Request-ID': requestId }),
            },
        }
    );
}

/**
 * Async error handler wrapper for API routes
 * Automatically catches and handles errors
 * 
 * @param handler - Async handler function
 * @returns Wrapped handler with error handling
 */
export function withErrorHandler<T extends any[]>(
    handler: (...args: T) => Promise<NextResponse>
) {
    return async (...args: T): Promise<NextResponse> => {
        try {
            return await handler(...args);
        } catch (error) {
            const request = args[0] as any;
            const requestId = request?.headers?.get?.('x-request-id');
            return handleError(error, requestId);
        }
    };
}
