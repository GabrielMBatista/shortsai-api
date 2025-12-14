# ShortsAI API 🚀

The central nervous system of the ShortsAI platform. A robust **Next.js (App Router)** backend acting as the API Gateway and Orchestrator.

## 🏗 Architecture

ShortsAI follows a **Modern Serverless Architecture**:

1.  **API Gateway (Node.js/Next.js)**:
    - Handles REST requests from the frontend (Studio).
    - Manages Database (Prisma + PostgreSQL).
    - **AI Orchestration**: Directly calls AI providers for asset generation.
        - **Gemini 2.5**: Script writing & Image prompting.
        - **ElevenLabs / Groq**: Audio synthesis.
    - **Asset Management**: Uploads generated media to Cloudflare R2.

2.  **Frontend (Studio)**:
    - **Client-Side Rendering**: Video assembly and rendering is done entirely in the user's browser using **WebCodecs** (MP4) or **MediaRecorder** (WebM).
    - This approach eliminates expensive cloud GPU costs for rendering.

> **Note**: The Python Worker (MoviePy) has been **deprecated** in favor of client-side composition for cost and performance efficiency.

## 📚 Core Services

-   **Jobs API**: `/api/jobs` - Manage generation workflows.
-   **Channels API**: `/api/channels` - Manage YouTube channels and personas.
-   **Personas API**: `/api/personas` - AI Personalities for content strategy.
-   **Assets**: Serves generated static media files.

## 🚀 Quick Start

1.  **Install Dependencies:**
    ```bash
    npm install
    ```

2.  **Database Setup (PostgreSQL):**
    ```bash
    npx prisma generate
    npx prisma db push
    ```

3.  **Run Development Server:**
    ```bash
    npm run dev
    ```

## 🔑 Environment Variables

Make sure to set up your `.env` file:

```env
DATABASE_URL="postgresql://..."
GEMINI_API_KEY="..."
ELEVENLABS_API_KEY="..."
```

## 🤝 Contribution

-   **Database Changes**: Always update `schema.prisma` and run `db push`.
-   **New Endpoints**: Use Next.js App Router conventions in `app/api/...`.
