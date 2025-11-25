'use client';

import SwaggerUI from 'swagger-ui-react';
import 'swagger-ui-react/swagger-ui.css';
import { OpenAPIObject } from '@/lib/types';

interface SwaggerViewerProps {
    spec: OpenAPIObject;
}

export default function SwaggerViewer({ spec }: SwaggerViewerProps) {
    return (
        <div className="swagger-wrapper">
            <div className="swagger-container bg-white rounded-lg shadow-xl overflow-hidden border border-gray-200">
                <SwaggerUI spec={spec} />
            </div>
            <style jsx global>{`
        .swagger-container {
          /* Force light mode colors for Swagger UI */
          color: #3b4151;
          background-color: #ffffff;
        }
        
        /* Reset global text color inheritance */
        .swagger-container .swagger-ui {
          color: #3b4151;
        }

        /* Fix inputs and selects */
        .swagger-container input,
        .swagger-container select,
        .swagger-container textarea {
          background-color: #ffffff !important;
          color: #3b4151 !important;
          border-color: #d9d9d9 !important;
        }

        /* Improve headers */
        .swagger-container .swagger-ui .info .title {
          color: #3b4151;
        }
        
        .swagger-container .swagger-ui .opblock-summary-method {
          font-weight: bold;
        }

        /* Hide the top bar (URL input) as we are serving a static spec */
        .swagger-ui .topbar {
          display: none;
        }
        
        /* Remove default box shadow from scheme container */
        .swagger-ui .scheme-container {
          box-shadow: none;
          background: transparent;
          padding: 0;
        }
      `}</style>
        </div>
    );
}
