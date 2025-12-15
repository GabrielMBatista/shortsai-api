import { z } from 'zod';
import { commonSchemas } from '../validation';

/**
 * Schema for creating a new user
 */
export const createUserSchema = z.object({
    email: commonSchemas.email,
    name: commonSchemas.nonEmptyString,
    avatar_url: z.string().url().optional(),
    google_id: z.string().optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

/**
 * Schema for user query parameters
 */
export const userQuerySchema = z.object({
    email: commonSchemas.email.optional(),
    user_id: commonSchemas.uuid.optional(),
});

export type UserQueryParams = z.infer<typeof userQuerySchema>;
