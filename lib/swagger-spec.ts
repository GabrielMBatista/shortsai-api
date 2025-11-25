import { OpenAPIObject } from './types';

export const openApiSpec: OpenAPIObject = {
    openapi: '3.0.0',
    info: {
        title: 'ShortsAI API',
        version: '1.0.0',
        description: 'API for generating short videos using AI',
    },
    servers: [
        {
            url: 'https://shortsai-api.vercel.app',
            description: 'Production Server',
        },
        {
            url: 'http://localhost:3000',
            description: 'Local Development',
        },
    ],
    paths: {
        '/api/hello': {
            get: {
                summary: 'Health Check',
                description: 'Returns a hello world message to verify API is working',
                responses: {
                    '200': {
                        description: 'Successful response',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        message: { type: 'string', example: 'Hello World' },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        '/api/users': {
            get: {
                summary: 'Get Users',
                parameters: [
                    {
                        name: 'email',
                        in: 'query',
                        schema: { type: 'string' },
                        description: 'Filter by email to get a specific user',
                    },
                ],
                responses: {
                    '200': {
                        description: 'List of users or single user',
                    },
                },
            },
            post: {
                summary: 'Create User',
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
                    '200': { description: 'User created' },
                },
            },
        },
        '/api/user/quota': {
            get: {
                summary: 'Get User Quota',
                parameters: [
                    {
                        name: 'user_id',
                        in: 'query',
                        required: true,
                        schema: { type: 'string' },
                    },
                ],
                responses: {
                    '200': {
                        description: 'User quota details',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        plan: { type: 'string' },
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
                    },
                },
            },
        },
        '/api/projects': {
            get: {
                summary: 'List Projects',
                parameters: [
                    {
                        name: 'user_id',
                        in: 'query',
                        required: true,
                        schema: { type: 'string' },
                    },
                ],
                responses: {
                    '200': { description: 'List of projects' },
                },
            },
            post: {
                summary: 'Create Project',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['user_id', 'topic', 'style', 'voice_name', 'tts_provider'],
                                properties: {
                                    user_id: { type: 'string' },
                                    topic: { type: 'string' },
                                    style: { type: 'string' },
                                    language: { type: 'string', default: 'en' },
                                    voice_name: { type: 'string' },
                                    tts_provider: { type: 'string', enum: ['gemini', 'elevenlabs'] },
                                    reference_image_url: { type: 'string' },
                                    characterIds: { type: 'array', items: { type: 'string' } },
                                    include_music: { type: 'boolean' },
                                    bg_music_prompt: { type: 'string' },
                                },
                            },
                        },
                    },
                },
                responses: {
                    '200': { description: 'Project created' },
                },
            },
        },
        '/api/projects/{id}': {
            get: {
                summary: 'Get Project',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { '200': { description: 'Project details' } },
            },
            patch: {
                summary: 'Update Project',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: {
                    content: {
                        'application/json': {
                            schema: { type: 'object' },
                        },
                    },
                },
                responses: { '200': { description: 'Project updated' } },
            },
            delete: {
                summary: 'Delete Project',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { '200': { description: 'Project deleted' } },
            },
        },
        '/api/characters': {
            get: {
                summary: 'List Characters',
                parameters: [{ name: 'user_id', in: 'query', required: true, schema: { type: 'string' } }],
                responses: { '200': { description: 'List of characters' } },
            },
            post: {
                summary: 'Create Character',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['user_id', 'name', 'images'],
                                properties: {
                                    user_id: { type: 'string' },
                                    name: { type: 'string' },
                                    description: { type: 'string' },
                                    images: { type: 'array', items: { type: 'string' } },
                                },
                            },
                        },
                    },
                },
                responses: { '201': { description: 'Character created' } },
            },
        },
        '/api/scenes': {
            post: {
                summary: 'Create Scene',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['project_id', 'scene_number', 'visual_description', 'narration', 'duration_seconds'],
                                properties: {
                                    project_id: { type: 'string' },
                                    scene_number: { type: 'integer' },
                                    visual_description: { type: 'string' },
                                    narration: { type: 'string' },
                                    duration_seconds: { type: 'number' },
                                },
                            },
                        },
                    },
                },
                responses: { '200': { description: 'Scene created' } },
            },
        },
        '/api/scenes/{id}': {
            patch: {
                summary: 'Update Scene',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: {
                    content: { 'application/json': { schema: { type: 'object' } } },
                },
                responses: { '200': { description: 'Scene updated' } },
            },
            delete: {
                summary: 'Delete Scene',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { '200': { description: 'Scene deleted' } },
            },
        },
        '/api/seed': {
            post: {
                summary: 'Seed Database',
                description: 'Creates admin user and default data',
                responses: {
                    '200': { description: 'Database seeded' },
                },
            },
        },
    },
};
