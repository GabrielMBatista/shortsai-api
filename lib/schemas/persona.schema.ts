import { z } from 'zod';
import { commonSchemas } from '../validation';

/**
 * Schema for creating a new persona
 */
export const createPersonaSchema = z.object({
    name: commonSchemas.nonEmptyString.max(100),
    category: z.string().min(1).max(50),
    type: z.enum(['text', 'image', 'video', 'audio']).default('text'),
    description: z.string().max(500).optional(),
    system_prompt: z.string().min(10).optional(),
    output_format: z.string().optional(),
    version: z.number().int().positive().default(1),
    is_active: z.boolean().default(true),
});

export type CreatePersonaInput = z.infer<typeof createPersonaSchema>;

/**
 * Schema for updating a persona
 */
export const updatePersonaSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    category: z.string().min(1).max(50).optional(),
    type: z.enum(['text', 'image', 'video', 'audio']).optional(),
    description: z.string().max(500).optional(),
    system_prompt: z.string().min(10).optional(),
    output_format: z.string().optional(),
    version: z.number().int().positive().optional(),
    is_active: z.boolean().optional(),
});

export type UpdatePersonaInput = z.infer<typeof updatePersonaSchema>;

/**
 * Schema for persona query parameters
 */
export const personaQuerySchema = z.object({
    category: z.string().optional(),
    type: z.enum(['text', 'image', 'video', 'audio']).optional(),
    is_active: z.coerce.boolean().optional(),
    ...commonSchemas.pagination.shape,
});

export type PersonaQueryParams = z.infer<typeof personaQuerySchema>;
