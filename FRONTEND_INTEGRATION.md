# Frontend Integration Guide: New Workflow & API Keys

## Overview
The generation logic has been moved to the backend to ensure security and robustness. The frontend no longer generates assets directly but sends commands to the backend. API keys can still be provided from the frontend (e.g., from local storage or settings) and will be securely used by the backend.

## 1. Sending Commands
Use the `/api/workflow/command` endpoint to control the generation process.

### Endpoint
`POST /api/workflow/command`

### Payload Structure
```typescript
interface WorkflowCommand {
    projectId: string;
    sceneId?: string; // Required for single asset regeneration
    action: 'generate_all' | 'regenerate_image' | 'regenerate_audio' | 'pause' | 'resume' | 'cancel';
    force?: boolean; // If true, overwrites existing assets
    apiKeys?: {
        gemini?: string;
        elevenlabs?: string;
    };
}
```

### Examples

#### A. Start Full Generation (Generate All)
```typescript
const startGeneration = async (projectId: string, keys: { gemini?: string, elevenlabs?: string }) => {
    await fetch('/api/workflow/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            projectId,
            action: 'generate_all',
            force: true, // Optional: restarts from scratch
            apiKeys: keys
        })
    });
};
```

#### B. Regenerate Single Image
```typescript
const regenerateImage = async (projectId: string, sceneId: string, keys: { gemini?: string }) => {
    await fetch('/api/workflow/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            projectId,
            sceneId,
            action: 'regenerate_image',
            force: true,
            apiKeys: keys
        })
    });
};
```

#### C. Regenerate Single Audio
```typescript
const regenerateAudio = async (projectId: string, sceneId: string, keys: { elevenlabs?: string }) => {
    await fetch('/api/workflow/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            projectId,
            sceneId,
            action: 'regenerate_audio',
            force: true,
            apiKeys: keys
        })
    });
};
```

## 2. Polling for Updates
The frontend should poll the project status to reflect changes in real-time.

### Endpoint
`GET /api/projects/{id}`

### Logic
1.  Poll every 2-5 seconds while `project.status === 'generating'`.
2.  Update the UI with the returned `scenes` array, which contains `image_url`, `audio_url`, `image_status`, and `audio_status`.
3.  Stop polling when `project.status` is `completed`, `failed`, or `paused`.

## 3. Key Changes from Previous Flow
1.  **No Client-Side Generation**: Do not call `AIService` or external APIs (OpenAI, ElevenLabs) directly from the browser.
2.  **Fire and Forget**: The `command` endpoint returns immediately. It does *not* wait for generation to finish.
## 4. Pre-Workflow AI Tools
For tasks that happen *before* a project is created (like generating the script or analyzing characters), use the generic AI endpoint.

### Endpoint
`POST /api/ai/generate`

### Actions

#### A. Generate Script
```typescript
const generateScript = async (userId: string, topic: string, style: string, language: string, durationConfig: any, keys: { gemini?: string }) => {
    const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userId,
            action: 'generate_script',
            params: { topic, style, language, durationConfig },
            apiKeys: keys
        })
    });
    const data = await res.json();
    return data.result; // Returns generic JSON script object
};
```

#### B. Analyze Character (for consistent avatars)
```typescript
const analyzeCharacter = async (userId: string, base64Image: string, keys: { gemini?: string }) => {
    const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userId,
            action: 'analyze_character',
            params: { base64Image },
            apiKeys: keys
        })
    });
    const data = await res.json();
    return data.result; // Returns string description
};
```

#### C. Optimize Reference Image (Headshot)
```typescript
const optimizeImage = async (userId: string, base64Image: string, keys: { gemini?: string }) => {
    const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userId,
            action: 'optimize_image',
            params: { base64Image },
            apiKeys: keys
        })
    });
    const data = await res.json();
    return data.result; // Returns base64 data URI
};
```
