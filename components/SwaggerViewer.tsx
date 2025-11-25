'use client';

import SwaggerUI from 'swagger-ui-react';
import 'swagger-ui-react/swagger-ui.css';
import { OpenAPIObject } from '@/lib/types';

interface SwaggerViewerProps {
    spec: OpenAPIObject;
}

export default function SwaggerViewer({ spec }: SwaggerViewerProps) {
    return (
        <div className="swagger-container bg-white dark:bg-gray-900 rounded-lg shadow-xl overflow-hidden">
            <SwaggerUI spec={spec} />
        </div>
    );
}
