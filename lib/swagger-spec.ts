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
        securitySchemes: {
            BearerAuth: {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT',
            },
        },
        schemas: {
            Project: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid' },
                    topic: { type: 'string' },
                    status: { type: 'string', enum: ['draft', 'generating', 'completed', 'failed'] },
                    scenes: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/Scene' },
                    },
                },
            },
            Scene: {
                type: 'object',
                properties: {
                    sceneNumber: { type: 'integer' },
                    narration: { type: 'string' },
                    imageUrl: { type: 'string', format: 'uri' },
                    audioUrl: { type: 'string', format: 'uri' },
                },
            },
            Character: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid' },
                    name: { type: 'string' },
                    description: { type: 'string' },
                    images: {
                        type: 'array',
                        items: { type: 'string', format: 'uri' },
                    },
                },
            },
        },
    },
    security: [
        { BearerAuth: [] },
    ],
    paths: {
        '/projects': {
            get: {
                summary: 'List user projects',
                parameters: [
                    { name: 'user_id', in: 'query', required: true, schema: { type: 'string' } }
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
                summary: 'Create and start generating a new project',
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
                                    characterIds: {
                                        type: 'array',
                                        items: { type: 'string', format: 'uuid' },
                                    },
                                },
                            },
                        },
                    },
                },
                responses: {
                    '201': {
                        description: 'Project created',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Project' },
                            },
                        },
                    },
                },
            },
        },
        '/projects/{id}': {
            get: {
                summary: 'Get project details',
                parameters: [
                    {
                        in: 'path',
                        name: 'id',
                        schema: { type: 'string', format: 'uuid' },
                        required: true,
                    },
                ],
                responses: {
                    '200': {
                        description: 'Project details',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Project' },
                            },
                        },
                    },
                },
            },
            delete: {
                summary: 'Delete a project',
                parameters: [
                    {
                        in: 'path',
                        name: 'id',
                        required: true,
                        schema: { type: 'string' },
                    },
                ],
                responses: {
                    '204': { description: 'Project deleted' },
                },
            },
        },
        '/characters': {
            get: {
                summary: 'Get user character library',
                parameters: [
                    { name: 'user_id', in: 'query', required: true, schema: { type: 'string' } }
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
            get: {
                summary: 'Get Character',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
                responses: {
                    '200': {
                        description: 'Character details',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Character' },
                            },
                        },
                    },
                },
            },
            delete: {
                summary: 'Delete Character',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
                responses: { '200': { description: 'Character deleted' } },
            },
        },
        '/user/quota': {
            get: {
                summary: 'Get current usage and limits',
                parameters: [
                    { name: 'user_id', in: 'query', required: true, schema: { type: 'string' } }
                ],
                responses: {
                    '200': {
                        description: 'User quota status',
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
                                                maxTTSMinutes: { type: 'integer' },
                                            },
                                        },
                                        used: {
                                            type: 'object',
                                            properties: {
                                                currentVideos: { type: 'integer' },
                                                currentTTSMinutes: { type: 'number' },
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
        '/seed': {
            post: {
                summary: 'Seed Database',
                description: 'Creates admin user and default data',
                responses: {
                    '200': { description: 'Database seeded' }
                }
            }
        }
    },
};
