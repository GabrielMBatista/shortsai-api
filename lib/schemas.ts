import { z } from 'zod';

export const createProjectSchema = z.object({
    topic: z.string().min(1, "Topic is required"),
    style: z.string().min(1, "Style is required"),
    language: z.string().default('en'),
    voice_name: z.string().min(1, "Voice name is required"),
    tts_provider: z.enum(['gemini', 'elevenlabs', 'groq']),
    audio_model: z.string().optional(),
    reference_image_url: z.string().optional().nullable(),
    characterIds: z.array(z.string()).optional(),
    include_music: z.boolean().optional().default(false),
    bg_music_prompt: z.string().optional().nullable(),
    duration_config: z.any().optional(), // Can be refined later if structure is known
});

export const updateProjectSchema = z.object({
    topic: z.string().optional(),
    style: z.string().optional(),
    language: z.string().optional(),
    voice_name: z.string().optional(),
    tts_provider: z.enum(['gemini', 'elevenlabs', 'groq']).optional(),
    audio_model: z.string().optional(),
    reference_image_url: z.string().optional().nullable(),
    characterIds: z.array(z.string()).optional(),
    include_music: z.boolean().optional(),
    bg_music_prompt: z.string().optional().nullable(),
    duration_config: z.any().optional(),
    status: z.string().optional(), // Allow updating status? Maybe restrict specific transitions later
    generated_title: z.string().optional(),
    generated_description: z.string().optional(),
    folder_id: z.string().optional().nullable(),
    is_archived: z.boolean().optional(),
    tags: z.array(z.string()).optional(),
});

export const createCharacterSchema = z.object({
    name: z.string().min(1, "Name is required"),
    description: z.string().optional().nullable(),
    images: z.array(z.string()).min(1, "At least one image is required"),
});

export const aiGenerateSchema = z.object({
    action: z.enum(['generate_script', 'generate_music_prompt', 'analyze_character', 'optimize_image']),
    params: z.record(z.string(), z.any()),
    apiKeys: z.record(z.string(), z.string()).optional(),
});
