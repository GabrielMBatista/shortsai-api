import { z } from 'zod';
import { commonSchemas } from '../validation';

/**
 * Schema for creating a new project
 */
export const createProjectSchema = z.object({
    topic: z.string().min(1).max(500000), // ✅ Aceita planejamentos mensais (3 semanas × 21 projetos)
    style: z.string().min(1).max(100),
    // ✅ Aceita códigos de idioma como 'en', 'pt-BR', 'es', etc
    language: z.enum(['en', 'pt-BR', 'es', 'fr', 'de', 'it', 'ja', 'ko']).default('en'),
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
    // ✅ Aceita códigos de idioma como 'en', 'pt-BR', 'es', etc
    language: z.enum(['en', 'pt-BR', 'es', 'fr', 'de', 'it', 'ja', 'ko']).optional(),
    // ✅ Alinhado com Prisma enum ProjectStatus: draft | generating | completed | failed | paused
    status: z.enum(['draft', 'generating', 'completed', 'failed', 'paused']).optional(),
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
    // ✅ Alinhado com Prisma enum ProjectStatus: draft | generating | completed | failed | paused
    status: z.enum(['draft', 'generating', 'completed', 'failed', 'paused']).optional(),
    isArchived: z.coerce.boolean().optional(),
    includeScenes: z.coerce.boolean().default(false),
    ...commonSchemas.pagination.shape,
});

export type ProjectQueryParams = z.infer<typeof projectQuerySchema>;
