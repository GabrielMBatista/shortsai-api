# 🧠 ShortsAI API

> **Backend Orchestration Engine for ShortsAI Studio**

This is the backend service for ShortsAI Studio, built with **Next.js App Router**, **Prisma ORM**, and **PostgreSQL**. It handles project orchestration, asset generation workflows, user management, and real-time updates via Server-Sent Events (SSE).

## ✨ Key Features

*   **Workflow Orchestration**: Manages complex, multi-step generation tasks (Script -> Images -> Audio -> Music) with dependency handling and retry logic.
*   **Concurrency Control**: Implements **Project Locking** (`/lock` / `/unlock`) to prevent race conditions during multi-tab usage or rapid-fire edits.
*   **Idempotency & Usage Tracking**: Deduplicated usage logging ensures accurate quota consumption even with network retries.
*   **Monetization Strategy**: Script generation engine (`gemini-2.5-flash`) is tuned to produce content strictly between **65s-90s** by default, maximizing monetization eligibility.
*   **Real-time Updates**: Uses **Server-Sent Events (SSE)** to push granular progress updates (e.g., "Generating Image for Scene 3...") to the frontend.
*   **Soft Delete Architecture**: Implements safe deletion for scenes and projects using `deleted_at` timestamps, preventing accidental data loss.
*   **Hybrid AI Integration**: Orchestrates calls to Google Gemini 2.5, ElevenLabs, and other AI providers.
*   **Robust Database Schema**: Fully typed PostgreSQL schema with Prisma, supporting complex relations (Projects, Scenes, Characters, Usage Logs).

## 🛠️ Tech Stack

*   **Framework**: Next.js 15 (App Router)
*   **Database**: PostgreSQL
*   **ORM**: Prisma
*   **API Style**: REST + SSE
*   **Language**: TypeScript

## 🚀 Getting Started

### Prerequisites

*   Node.js v18+
*   PostgreSQL Database (Local or Cloud like Supabase/Neon)

### Installation

1.  Clone the repository:
    ```bash
    git clone <repository-url>
    cd shortsai-api
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Configure Environment Variables:
    Create a `.env` file in the root directory:
    ```env
    DATABASE_URL="postgresql://user:password@localhost:5432/shortsai"
    NEXT_PUBLIC_APP_URL="http://localhost:3000"
    ELEVENLABS_API_KEY="your-key-here"
    GEMINI_API_KEY="your-key-here"
    ```

4.  Initialize Database:
    ```bash
    # Run migrations
    npx prisma migrate dev

    # Seed initial data (optional)
    npx prisma db seed
    ```

5.  Run Development Server:
    ```bash
    npm run dev
    ```

    The API will be available at `http://localhost:3000`.

## 📚 API Documentation

### Core Endpoints

*   **Projects**
    *   `GET /api/projects`: List projects (filters soft-deleted scenes).
    *   `POST /api/projects`: Create a new project.
    *   `GET /api/projects/[id]`: Get full project details.
    *   `PATCH /api/projects/[id]`: Update project metadata.

*   **Scenes**
    *   `PATCH /api/scenes/[id]`: Update scene content.
    *   `DELETE /api/scenes/[id]`: Soft delete a scene.

*   **Workflow**
    *   `POST /api/workflow/command`: Trigger actions (generate_all, regenerate_image, etc.).
    *   `GET /api/events/[projectId]`: SSE endpoint for real-time status.

*   **Users & Assets**
    *   `POST /api/users`: Sync user profile.
    *   `POST /api/characters`: Manage consistent characters.

## 🛡️ Database Management

*   **Migration**: `npx prisma migrate dev --name <migration_name>`
*   **Studio (GUI)**: `npx prisma studio`
*   **Generate Client**: `npx prisma generate` (Run after schema changes)

## 🔄 Workflow Architecture

The backend uses a **stateless dispatcher** pattern.
1.  Frontend sends a command (`/api/workflow/command`).
2.  Backend updates DB status to `queued` or `pending`.
3.  Dispatcher finds the next available task and triggers a background worker (`/api/workflow/process`).
4.  Worker executes the AI task and updates the DB.
5.  Updates are broadcasted to the frontend via SSE.

---

Developed for ShortsAI Studio.
