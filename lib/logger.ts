import pino from 'pino';

const isDevelopment = process.env.NODE_ENV === 'development';
const isTest = process.env.NODE_ENV === 'test';

export const logger = pino({
    level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),

    // Pretty print in development, JSON in production
    transport: isDevelopment && !isTest
        ? {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'HH:MM:ss',
                ignore: 'pid,hostname',
                singleLine: false,
            },
        }
        : undefined,

    // Base context for all logs
    base: {
        env: process.env.NODE_ENV,
        service: 'shortsai-api',
    },

    // Silence logs in test environment
    enabled: !isTest,

    // Custom formatters
    formatters: {
        level: (label) => ({ level: label }),
    },

    // Standard serializers
    serializers: {
        error: pino.stdSerializers.err,
        req: pino.stdSerializers.req,
        res: pino.stdSerializers.res,
    },
});

/**
 * Create a child logger with request-specific context
 * @param requestId - Unique identifier for the request
 * @param userId - Optional user ID
 * @returns Child logger instance
 */
export const createRequestLogger = (requestId: string, userId?: string) => {
    return logger.child({ requestId, userId });
};

/**
 * Create a child logger with service-specific context
 * @param service - Service name (e.g., 'ChannelService', 'WorkflowEngine')
 * @returns Child logger instance
 */
export const createServiceLogger = (service: string) => {
    return logger.child({ service });
};

/**
 * Log performance metrics
 * @param operation - Name of the operation
 * @param duration - Duration in milliseconds
 * @param metadata - Additional metadata
 */
export const logPerformance = (
    operation: string,
    duration: number,
    metadata?: Record<string, any>
) => {
    logger.info({
        type: 'performance',
        operation,
        duration,
        ...metadata,
    }, `${operation} completed in ${duration}ms`);
};

export default logger;
