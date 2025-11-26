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
            url: 'https://shortsai-api.vercel.app/api',
            description: 'Production Server',
        },
        {
            url: 'http://localhost:3000/api',
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
                    tts_provider: { type: 'string', enum: ['gemini', 'elevenlabs'] },
                    language: { type: 'string', default: 'en' },
                    status: { type: 'string', enum: ['draft', 'generating', 'completed', 'failed'] },
                    include_music: { type: 'boolean' },
                    bg_music_prompt: { type: 'string' },
                    bg_music_url: { type: 'string' },
                    generated_title: { type: 'string' },
                    generated_description: { type: 'string' },
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
                summary: 'Update scene assets and content',
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
                                    image_url: { type: 'string' },
                                    image_status: { type: 'string' },
                                    audio_url: { type: 'string' },
                                    audio_status: { type: 'string' },
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
    },
};
