import { z } from 'zod';

/**
 * Schema for AI generation requests
 */
export const aiGenerateSchema = z.object({
    action: z.enum(['generate_script', 'generate_music_prompt', 'analyze_character', 'optimize_image']),
    params: z.record(z.string(), z.any()),
    apiKeys: z.record(z.string(), z.string()).optional(),
});

export type AIGenerateInput = z.infer<typeof aiGenerateSchema>;
