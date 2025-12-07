import { OpenAPIObject } from './types';

export const openApiSpec: OpenAPIObject = {
    openapi: '3.0.3',
    info: {
        title: 'ShortsAI Studio API',
        description: 'API contract for the ShortsAI automated video generator backend.',
        version: '1.0.0',
    },
    servers: [
        {
            url: 'http://localhost:3333/api',
            description: 'Production Server',
        },
        {
            url: 'http://localhost:3333/api',
            description: 'Local Development',
        },
    ],
    components: {
        schemas: {
            Project: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid' },
                    user_id: { type: 'string', format: 'uuid' },
                    topic: { type: 'string' },
                    style: { type: 'string' },
                    voice_name: { type: 'string' },
                    tts_provider: { type: 'string', enum: ['gemini', 'elevenlabs', 'groq'] },
                    language: { type: 'string', default: 'en' },
                    status: { type: 'string', enum: ['draft', 'generating', 'completed', 'failed', 'paused'] },
                    include_music: { type: 'boolean' },
                    bg_music_prompt: { type: 'string' },
                    bg_music_url: { type: 'string' },
                    generated_title: { type: 'string' },
                    generated_description: { type: 'string' },
                    duration_config: {
                        type: 'object',
                        properties: {
                            min: { type: 'integer' },
                            max: { type: 'integer' },
                            targetScenes: { type: 'integer' },
                        },
                    },
                    characterIds: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'List of Character UUIDs used for visual consistency.',
                    },
                    reference_image_url: {
                        type: 'string',
                        deprecated: true,
                        description: 'Use characterIds instead.',
                    },
                    scenes: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/Scene' },
                    },
                    characters: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/Character' },
                    },
                    created_at: { type: 'string', format: 'date-time' },
                },
            },
            Scene: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid' },
                    scene_number: { type: 'integer' },
                    visual_description: { type: 'string' },
                    narration: { type: 'string' },
                    duration_seconds: { type: 'number' },
                    image_url: { type: 'string' },
                    image_status: { type: 'string', enum: ['pending', 'loading', 'completed', 'error'] },
                    audio_url: { type: 'string' },
                    audio_status: { type: 'string', enum: ['pending', 'loading', 'completed', 'error'] },
                    sfx_url: { type: 'string' },
                    sfx_status: { type: 'string', enum: ['pending', 'loading', 'completed', 'error'] },
                    image_attempts: { type: 'integer' },
                    audio_attempts: { type: 'integer' },
                    sfx_attempts: { type: 'integer' },
                },
            },
            Character: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid' },
                    user_id: { type: 'string', format: 'uuid' },
                    name: { type: 'string' },
                    description: { type: 'string' },
                    images: {
                        type: 'array',
                        items: { type: 'string' },
                    },
                },
            },
            UserQuota: {
                type: 'object',
                properties: {
                    plan: { type: 'string', enum: ['free', 'pro', 'enterprise'] },
                    limits: {
                        type: 'object',
                        properties: {
                            maxVideos: { type: 'integer' },
                            maxTTSMinutes: { type: 'number' },
                            maxImages: { type: 'integer' },
                        },
                    },
                    used: {
                        type: 'object',
                        properties: {
                            currentVideos: { type: 'integer' },
                            currentTTSMinutes: { type: 'number' },
                            currentImages: { type: 'integer' },
                        },
                    },
                },
            },
            Show: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid' },
                    user_id: { type: 'string', format: 'uuid' },
                    name: { type: 'string' },
                    description: { type: 'string' },
                    style_preset: { type: 'string' },
                    visual_prompt: { type: 'string' },
                    default_tts_provider: { type: 'string' },
                    updated_at: { type: 'string', format: 'date-time' },
                    created_at: { type: 'string', format: 'date-time' },
                },
            },
            Folder: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid' },
                    user_id: { type: 'string', format: 'uuid' },
                    name: { type: 'string' },
                    created_at: { type: 'string', format: 'date-time' },
                },
            },
        },
    },
    paths: {
        '/users': {
            post: {
                summary: 'Create or Get User',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['email', 'name'],
                                properties: {
                                    email: { type: 'string' },
                                    name: { type: 'string' },
                                    avatar_url: { type: 'string' },
                                    google_id: { type: 'string' },
                                },
                            },
                        },
                    },
                },
                responses: {
                    '200': { description: 'User created or retrieved' },
                },
            },
            get: {
                summary: 'Get user by email',
                parameters: [
                    { name: 'email', in: 'query', schema: { type: 'string' } },
                ],
                responses: {
                    '200': { description: 'User details' },
                },
            },
        },
        '/user/apikeys': {
            get: {
                summary: 'Get User API Keys (Masked/Encrypted)',
                parameters: [
                    { name: 'user_id', in: 'query', required: true, schema: { type: 'string' } },
                ],
                responses: {
                    '200': {
                        description: 'Masked API keys',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        gemini_key: { type: 'string' },
                                        elevenlabs_key: { type: 'string' },
                                        suno_key: { type: 'string' },
                                        groq_key: { type: 'string' },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            post: {
                summary: 'Save User API Keys',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['user_id'],
                                properties: {
                                    user_id: { type: 'string' },
                                    gemini_key: { type: 'string' },
                                    elevenlabs_key: { type: 'string' },
                                    suno_key: { type: 'string' },
                                    groq_key: { type: 'string' },
                                },
                            },
                        },
                    },
                },
                responses: {
                    '200': { description: 'API keys saved' },
                },
            },
        },
        '/users/quota': {
            get: {
                summary: 'Get User Usage Quota',
                parameters: [
                    { name: 'user_id', in: 'query', required: true, schema: { type: 'string' } },
                ],
                responses: {
                    '200': {
                        description: 'Current usage stats',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/UserQuota' },
                            },
                        },
                    },
                },
            },
        },
        '/usage': {
            post: {
                summary: 'Log API Usage (Client-reported)',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['user_id', 'action_type', 'provider'],
                                properties: {
                                    user_id: { type: 'string' },
                                    project_id: { type: 'string' },
                                    action_type: { type: 'string' },
                                    provider: { type: 'string' },
                                    model_name: { type: 'string' },
                                    tokens_input: { type: 'integer' },
                                    tokens_output: { type: 'integer' },
                                    status: { type: 'string' },
                                    idempotency_key: { type: 'string' },
                                },
                            },
                        },
                    },
                },
                responses: {
                    '201': { description: 'Log saved' },
                },
            },
        },
        '/projects': {
            get: {
                summary: 'List user projects',
                parameters: [
                    { name: 'user_id', in: 'query', required: true, schema: { type: 'string' } },
                ],
                responses: {
                    '200': {
                        description: 'List of projects',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'array',
                                    items: { $ref: '#/components/schemas/Project' },
                                },
                            },
                        },
                    },
                },
            },
            post: {
                summary: 'Create a new project',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['user_id', 'topic', 'style', 'voice_name'],
                                properties: {
                                    user_id: { type: 'string' },
                                    topic: { type: 'string' },
                                    style: { type: 'string' },
                                    voice_name: { type: 'string' },
                                    tts_provider: { type: 'string', enum: ['gemini', 'elevenlabs'] },
                                    language: { type: 'string' },
                                    include_music: { type: 'boolean' },
                                    bg_music_prompt: { type: 'string' },
                                    duration_config: {
                                        type: 'object',
                                        properties: {
                                            min: { type: 'integer' },
                                            max: { type: 'integer' },
                                            targetScenes: { type: 'integer' },
                                        },
                                    },
                                    characterIds: {
                                        type: 'array',
                                        items: { type: 'string' },
                                        description: 'Array of Character UUIDs to link',
                                    },
                                },
                            },
                        },
                    },
                },
                responses: {
                    '200': { description: 'Project created (returns full project with ID)' },
                },
            },
        },
        '/projects/{id}': {
            patch: {
                summary: 'Update project details',
                parameters: [
                    { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
                ],
                requestBody: {
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/Project' },
                        },
                    },
                },
                responses: {
                    '200': { description: 'Project updated' },
                },
            },
            delete: {
                summary: 'Delete a project',
                parameters: [
                    { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
                ],
                responses: {
                    '200': { description: 'Project deleted' },
                },
            },
        },
        '/scenes': {
            post: {
                summary: 'Create a scene',
                requestBody: {
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['project_id', 'scene_number'],
                                properties: {
                                    project_id: { type: 'string' },
                                    scene_number: { type: 'integer' },
                                    visual_description: { type: 'string' },
                                    narration: { type: 'string' },
                                    duration_seconds: { type: 'number' },
                                    image_url: { type: 'string' },
                                    audio_url: { type: 'string' },
                                },
                            },
                        },
                    },
                },
                responses: {
                    '200': { description: 'Scene created' },
                },
            },
        },
        '/scenes/{id}': {
            patch: {
                summary: 'Update scene text content',
                parameters: [
                    { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
                ],
                requestBody: {
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    visual_description: { type: 'string', description: 'Updated visual prompt' },
                                    narration: { type: 'string', description: 'Updated narration text' },
                                    duration_seconds: { type: 'number' },
                                },
                            },
                        },
                    },
                },
                responses: {
                    '200': { description: 'Scene updated' },
                },
            },
        },
        '/scenes/{id}/status': {
            patch: {
                summary: 'Update scene status (initiate generation)',
                parameters: [
                    { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
                ],
                requestBody: {
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['type', 'status'],
                                properties: {
                                    type: { type: 'string', enum: ['image', 'audio', 'sfx'] },
                                    status: { type: 'string', enum: ['loading'] },
                                    force_regen: { type: 'boolean' },
                                },
                            },
                        },
                    },
                },
                responses: {
                    '200': { description: 'Status updated' },
                    '409': { description: 'Asset already exists (requires force_regen)' },
                },
            },
        },
        '/scenes/{id}/asset': {
            patch: {
                summary: 'Save generated asset (Image/Audio)',
                parameters: [
                    { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
                ],
                requestBody: {
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    image_url: { type: 'string' },
                                    image_status: { type: 'string', enum: ['completed'] },
                                    audio_url: { type: 'string' },
                                    audio_status: { type: 'string', enum: ['completed'] },
                                },
                            },
                        },
                    },
                },
                responses: {
                    '200': { description: 'Asset saved' },
                },
            },
        },
        '/scenes/{id}/sfx': {
            patch: {
                summary: 'Save generated SFX',
                parameters: [
                    { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
                ],
                requestBody: {
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['sfx_url', 'sfx_status'],
                                properties: {
                                    sfx_url: { type: 'string' },
                                    sfx_status: { type: 'string', enum: ['completed'] },
                                },
                            },
                        },
                    },
                },
                responses: {
                    '200': { description: 'SFX saved' },
                },
            },
        },
        '/characters': {
            get: {
                summary: 'Get user character library',
                parameters: [
                    { name: 'user_id', in: 'query', required: true, schema: { type: 'string' } },
                ],
                responses: {
                    '200': {
                        description: 'List of characters',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'array',
                                    items: { $ref: '#/components/schemas/Character' },
                                },
                            },
                        },
                    },
                },
            },
            post: {
                summary: 'Save a new character',
                requestBody: {
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['user_id', 'name', 'images'],
                                properties: {
                                    user_id: { type: 'string' },
                                    name: { type: 'string' },
                                    description: { type: 'string' },
                                    images: {
                                        type: 'array',
                                        items: { type: 'string' },
                                    },
                                },
                            },
                        },
                    },
                },
                responses: {
                    '201': { description: 'Character saved' },
                },
            },
        },
        '/characters/{id}': {
            delete: {
                parameters: [
                    { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
                ],
                responses: {
                    '200': { description: 'Character deleted' },
                },
            },
        },
        '/projects/{id}/lock': {
            post: {
                summary: 'Acquire lock for project generation',
                parameters: [
                    { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
                ],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['session_id'],
                                properties: {
                                    session_id: { type: 'string' },
                                },
                            },
                        },
                    },
                },
                responses: {
                    '200': { description: 'Lock acquired' },
                    '409': { description: 'Project locked by another session' },
                },
            },
        },
        '/projects/{id}/unlock': {
            post: {
                summary: 'Release lock for project',
                parameters: [
                    { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
                ],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['session_id'],
                                properties: {
                                    session_id: { type: 'string' },
                                    status: { type: 'string', enum: ['completed', 'failed'] },
                                },
                            },
                        },
                    },
                },
                responses: {
                    '200': { description: 'Lock released' },
                },
            },
        },
        '/workflow/command': {
            post: {
                summary: 'Send a workflow command',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['projectId', 'action'],
                                properties: {
                                    projectId: { type: 'string', format: 'uuid' },
                                    sceneId: { type: 'string', format: 'uuid' },
                                    action: {
                                        type: 'string',
                                        enum: ['generate_all', 'generate_image', 'generate_audio', 'regenerate_image', 'regenerate_audio', 'cancel', 'pause', 'resume', 'skip_scene']
                                    },
                                    force: { type: 'boolean' },
                                    apiKeys: {
                                        type: 'object',
                                        properties: {
                                            gemini: { type: 'string' },
                                            elevenlabs: { type: 'string' },
                                            groq: { type: 'string' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                responses: {
                    '200': { description: 'Command accepted' },
                    '400': { description: 'Invalid command' },
                },
            },
        },
        '/ai/generate': {
            post: {
                summary: 'Ad-hoc AI Generation (Script, Music Prompt, etc.)',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['userId', 'action', 'params'],
                                properties: {
                                    userId: { type: 'string', format: 'uuid' },
                                    action: {
                                        type: 'string',
                                        enum: ['generate_script', 'generate_music_prompt', 'analyze_character', 'optimize_image']
                                    },
                                    params: { type: 'object' },
                                    apiKeys: {
                                        type: 'object',
                                        properties: {
                                            gemini: { type: 'string' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                responses: {
                    '200': {
                        description: 'Generation result',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        result: { type: 'object' } // Can be string or object (script)
                                    }
                                }
                            }
                        }
                    },
                },
            },
        },
        '/shows': {
            get: {
                summary: 'List user shows',
                responses: {
                    '200': {
                        description: 'List of shows',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'array',
                                    items: { $ref: '#/components/schemas/Show' },
                                },
                            },
                        },
                    },
                },
            },
            post: {
                summary: 'Create a new show',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['name'],
                                properties: {
                                    name: { type: 'string' },
                                    description: { type: 'string' },
                                    style_preset: { type: 'string' },
                                    visual_prompt: { type: 'string' },
                                    default_tts_provider: { type: 'string', enum: ['gemini', 'elevenlabs', 'groq'] },
                                },
                            },
                        },
                    },
                },
                responses: {
                    '201': { description: 'Show created' },
                },
            },
        },
        '/shows/{id}': {
            get: {
                summary: 'Get show details',
                parameters: [
                    { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
                ],
                responses: {
                    '200': { description: 'Show details', content: { 'application/json': { schema: { $ref: '#/components/schemas/Show' } } } },
                },
            },
            patch: {
                summary: 'Update show',
                parameters: [
                    { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
                ],
                requestBody: {
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    name: { type: 'string' },
                                    description: { type: 'string' },
                                    style_preset: { type: 'string' },
                                    visual_prompt: { type: 'string' },
                                    default_tts_provider: { type: 'string' },
                                },
                            },
                        },
                    },
                },
                responses: {
                    '200': { description: 'Show updated' },
                },
            },
            delete: {
                summary: 'Delete show',
                parameters: [
                    { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
                ],
                responses: {
                    '200': { description: 'Show deleted' },
                },
            },
        },
        '/folders': {
            get: {
                summary: 'List user folders',
                responses: {
                    '200': {
                        description: 'List of folders',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        folders: { type: 'array', items: { $ref: '#/components/schemas/Folder' } },
                                        rootCount: { type: 'integer' },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            post: {
                summary: 'Create folder',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['name'],
                                properties: { name: { type: 'string' } },
                            },
                        },
                    },
                },
                responses: {
                    '200': { description: 'Folder created' },
                },
            },
        },
        '/folders/{id}': {
            patch: {
                summary: 'Rename folder',
                parameters: [
                    { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
                ],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['name'],
                                properties: { name: { type: 'string' } },
                            },
                        },
                    },
                },
                responses: {
                    '200': { description: 'Folder updated' },
                },
            },
            delete: {
                summary: 'Delete folder',
                parameters: [
                    { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
                ],
                responses: {
                    '200': { description: 'Folder deleted' },
                },
            },
        },
        '/render': {
            post: {
                summary: 'Queue video render job',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['projectId', 'scenes'],
                                properties: {
                                    projectId: { type: 'string' },
                                    scenes: { type: 'array', items: { $ref: '#/components/schemas/Scene' } },
                                    bgMusicUrl: { type: 'string' },
                                },
                            },
                        },
                    },
                },
                responses: {
                    '200': {
                        description: 'Job Queued',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        success: { type: 'boolean' },
                                        jobId: { type: 'string' },
                                        status: { type: 'string' },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        '/render/{id}': {
            get: {
                summary: 'Get render job status',
                parameters: [
                    { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
                ],
                responses: {
                    '200': {
                        description: 'Job Status',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        id: { type: 'string' },
                                        status: { type: 'string' },
                                        resultUrl: { type: 'string' },
                                        progress: { type: 'number' },
                                        eta: { type: 'number' },
                                        error: { type: 'string' }
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
    },
};
