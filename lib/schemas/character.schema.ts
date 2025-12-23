import { z } from 'zod';

export const createCharacterSchema = z.object({
    name: z.string().min(1, 'Character name is required'),
    description: z.string().optional(),
    images: z.array(z.string()).default([]),
});

export type CreateCharacterInput = z.infer<typeof createCharacterSchema>;
