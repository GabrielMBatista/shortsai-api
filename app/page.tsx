import { openApiSpec } from "@/lib/swagger-spec";
import SwaggerViewer from "@/components/SwaggerViewer";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-950 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
            ShortsAI API Documentation
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Complete reference for the ShortsAI backend API.
          </p>
          <div className="flex justify-center gap-4">
            <a
              href="/api/openapi.json"
              target="_blank"
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Download OpenAPI JSON
            </a>
          </div>
        </div>

        <SwaggerViewer spec={openApiSpec} />
      </div>
    </main>
  );
}
