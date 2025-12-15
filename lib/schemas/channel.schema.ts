import { z } from 'zod';
import { commonSchemas } from '../validation';

/**
 * Schema for activating a persona for a channel
 */
export const activatePersonaSchema = z.object({
    personaId: commonSchemas.uuid,
});

export type ActivatePersonaInput = z.infer<typeof activatePersonaSchema>;

/**
 * Schema for creating a new channel
 */
export const createChannelSchema = z.object({
    name: z.string().min(1).max(255),
    youtubeChannelId: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
});

export type CreateChannelInput = z.infer<typeof createChannelSchema>;

/**
 * Schema for updating channel
 */
export const updateChannelSchema = z.object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().max(500).optional(),
    personaId: commonSchemas.uuid.optional(),
});

export type UpdateChannelInput = z.infer<typeof updateChannelSchema>;

/**
 * Schema for channel query parameters
 */
export const channelQuerySchema = z.object({
    userId: commonSchemas.uuid.optional(),
    includePersona: z.coerce.boolean().default(false),
    includeStats: z.coerce.boolean().default(false),
});

export type ChannelQueryParams = z.infer<typeof channelQuerySchema>;
