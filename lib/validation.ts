import { z, ZodSchema } from 'zod';
import { NextRequest } from 'next/server';

/**
 * Validate request body against a Zod schema
 * Throws validation error if validation fails
 * 
 * @param req - Next.js request object
 * @param schema - Zod schema to validate against
 * @returns Validated and typed data
 */
export async function validateRequest<T>(
    req: NextRequest,
    schema: ZodSchema<T>
): Promise<T> {
    try {
        const body = await req.json();
        return schema.parse(body);
    } catch (error) {
        if (error instanceof z.ZodError) {
            throw error; // Will be handled by error-handler middleware
        }
        throw new Error('Invalid JSON in request body');
    }
}

/**
 * Validate query parameters against a Zod schema
 * 
 * @param searchParams - URLSearchParams from request
 * @param schema - Zod schema to validate against
 * @returns Validated and typed data
 */
export function validateQueryParams<T>(
    searchParams: URLSearchParams,
    schema: ZodSchema<T>
): T {
    const params = Object.fromEntries(searchParams);
    return schema.parse(params);
}

/**
 * Validate path parameters against a Zod schema
 * 
 * @param params - Path parameters object
 * @param schema - Zod schema to validate against
 * @returns Validated and typed data
 */
export function validatePathParams<T>(
    params: Record<string, string | string[]>,
    schema: ZodSchema<T>
): T {
    return schema.parse(params);
}

/**
 * Safe parse wrapper that returns result with type safety
 * Useful when you want to handle errors manually
 * 
 * @param data - Data to validate
 * @param schema - Zod schema to validate against
 * @returns Object with success flag and data or error
 */
export function safeParse<T>(
    data: unknown,
    schema: ZodSchema<T>
): { success: true; data: T } | { success: false; error: z.ZodError } {
    const result = schema.safeParse(data);

    if (result.success) {
        return { success: true, data: result.data };
    }

    return { success: false, error: result.error };
}

// Common reusable schemas
export const commonSchemas = {
    uuid: z.string().uuid({ message: 'Must be a valid UUID' }),

    email: z.string().email({ message: 'Must be a valid email address' }),

    url: z.string().url({ message: 'Must be a valid URL' }),

    positiveInt: z.number().int().positive({ message: 'Must be a positive integer' }),

    nonEmptyString: z.string().min(1, { message: 'Cannot be empty' }),

    pagination: z.object({
        page: z.coerce.number().int().positive().default(1),
        pageSize: z.coerce.number().int().positive().max(100).default(20),
    }),

    dateRange: z.object({
        startDate: z.coerce.date(),
        endDate: z.coerce.date(),
    }).refine(data => data.endDate >= data.startDate, {
        message: 'End date must be after start date',
    }),
};
