import { z } from 'zod';
import { commonSchemas } from '../validation';

/**
 * Schema for creating a new project
 */
export const createProjectSchema = z.object({
    topic: z.string().min(1).max(500),
    style: z.string().min(1).max(100),
    language: z.string().length(2).default('en'),
    duration: z.number().int().min(15).max(180).optional(),
    channelId: commonSchemas.uuid.optional(),
    personaId: commonSchemas.uuid.optional(),
    folderId: commonSchemas.uuid.optional(),
    tags: z.array(z.string()).max(10).default([]),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

/**
 * Schema for updating a project
 */
export const updateProjectSchema = z.object({
    topic: z.string().min(1).max(500).optional(),
    style: z.string().min(1).max(100).optional(),
    language: z.string().length(2).optional(),
    status: z.enum(['DRAFT', 'IN_PROGRESS', 'COMPLETED', 'FAILED']).optional(),
    folderId: commonSchemas.uuid.nullable().optional(),
    tags: z.array(z.string()).max(10).optional(),
    isArchived: z.boolean().optional(),
});

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

/**
 * Schema for project query parameters
 */
export const projectQuerySchema = z.object({
    userId: commonSchemas.uuid.optional(),
    channelId: commonSchemas.uuid.optional(),
    folderId: commonSchemas.uuid.optional(),
    status: z.enum(['DRAFT', 'IN_PROGRESS', 'COMPLETED', 'FAILED']).optional(),
    isArchived: z.coerce.boolean().optional(),
    includeScenes: z.coerce.boolean().default(false),
    ...commonSchemas.pagination.shape,
});

export type ProjectQueryParams = z.infer<typeof projectQuerySchema>;
