/**
 * Base class for all application errors
 * Provides consistent error structure across the application
 */
export class AppError extends Error {
    constructor(
        public message: string,
        public statusCode: number = 500,
        public code?: string,
        public details?: any
    ) {
        super(message);
        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }

    toJSON() {
        return {
            error: this.message,
            code: this.code,
            statusCode: this.statusCode,
            ...(this.details && { details: this.details }),
        };
    }
}

/**
 * 400 Bad Request - Invalid input data
 */
export class BadRequestError extends AppError {
    constructor(message: string = 'Bad request', details?: any) {
        super(message, 400, 'BAD_REQUEST', details);
    }
}

/**
 * 401 Unauthorized - Authentication required
 */
export class UnauthorizedError extends AppError {
    constructor(message: string = 'Unauthorized') {
        super(message, 401, 'UNAUTHORIZED');
    }
}

/**
 * 403 Forbidden - Authenticated but not allowed
 */
export class ForbiddenError extends AppError {
    constructor(message: string = 'Forbidden') {
        super(message, 403, 'FORBIDDEN');
    }
}

/**
 * 404 Not Found - Resource doesn't exist
 */
export class NotFoundError extends AppError {
    constructor(resource: string, id?: string) {
        const message = id
            ? `${resource} with ID ${id} not found`
            : `${resource} not found`;
        super(message, 404, 'NOT_FOUND');
    }
}

/**
 * 409 Conflict - Resource already exists or state conflict
 */
export class ConflictError extends AppError {
    constructor(message: string) {
        super(message, 409, 'CONFLICT');
    }
}

/**
 * 422 Unprocessable Entity - Validation failed
 */
export class ValidationError extends AppError {
    constructor(details: any) {
        super('Validation failed', 422, 'VALIDATION_ERROR', details);
    }
}

/**
 * 429 Too Many Requests - Rate limit exceeded
 */
export class RateLimitError extends AppError {
    constructor(public retryAfter: number) {
        super('Rate limit exceeded', 429, 'RATE_LIMIT_EXCEEDED', { retryAfter });
    }
}

/**
 * 500 Internal Server Error - Unexpected error
 */
export class InternalServerError extends AppError {
    constructor(message: string = 'Internal server error', details?: any) {
        super(message, 500, 'INTERNAL_ERROR', details);
    }
}

/**
 * 503 Service Unavailable - External service is down
 */
export class ServiceUnavailableError extends AppError {
    constructor(service: string) {
        super(`Service ${service} is unavailable`, 503, 'SERVICE_UNAVAILABLE');
    }
}

/**
 * Database-specific errors
 */
export class DatabaseError extends AppError {
    constructor(message: string, originalError?: Error) {
        super(
            message,
            500,
            'DATABASE_ERROR',
            originalError ? { originalError: originalError.message } : undefined
        );
    }
}

/**
 * External API errors
 */
export class ExternalApiError extends AppError {
    constructor(service: string, message: string, statusCode?: number) {
        super(
            `External API error from ${service}: ${message}`,
            statusCode || 502,
            'EXTERNAL_API_ERROR',
            { service }
        );
    }
}
