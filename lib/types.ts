export interface OpenAPIObject {
    openapi: string;
    info: {
        title: string;
        version: string;
        description?: string;
    };
    servers?: {
        url: string;
        description?: string;
    }[];
    components?: {
        securitySchemes?: Record<string, any>;
        schemas?: Record<string, any>;
    };
    security?: Record<string, string[]>[];
    paths: {
        [path: string]: {
            [method: string]: {
                summary?: string;
                description?: string;
                parameters?: any[];
                requestBody?: any;
                responses: {
                    [statusCode: string]: {
                        description: string;
                        content?: any;
                    };
                };
            };
        };
    };
}
