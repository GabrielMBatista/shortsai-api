
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// QUEUE PATH:
// In Docker, mapped to shared volume (e.g., /app/data/queue.json)
// Locally, defaults to project root
const QUEUE_PATH = process.env.QUEUE_PATH || path.join(process.cwd(), 'queue.json');

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { projectId, scenes, bgMusicUrl } = body;

        if (!projectId || !scenes || !Array.isArray(scenes)) {
            return NextResponse.json({ error: 'Invalid payload: projectId and scenes array required' }, { status: 400 });
        }

        // Basic validation of scenes
        if (scenes.length === 0) {
            return NextResponse.json({ error: 'No scenes provided' }, { status: 400 });
        }

        // Create new Job
        const newJob = {
            id: uuidv4(),
            type: 'render_video',
            status: 'pending',
            projectId,
            payload: {
                projectId,
                scenes,
                bgMusicUrl
            },
            createdAt: new Date().toISOString()
        };

        // Read Queue
        let queue: any[] = [];
        if (fs.existsSync(QUEUE_PATH)) {
            try {
                const fileContent = fs.readFileSync(QUEUE_PATH, 'utf-8');
                if (fileContent.trim()) {
                    queue = JSON.parse(fileContent);
                }
            } catch (e) {
                console.error("Queue Read Error (creating new)", e);
                queue = [];
            }
        }

        // Add to queue
        queue.push(newJob);

        // Write back
        fs.writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2), 'utf-8');

        return NextResponse.json({
            success: true,
            jobId: newJob.id,
            status: 'pending',
            message: 'Render job queued successfully'
        });

    } catch (error: any) {
        console.error('Error queuing render job:', error);
        return NextResponse.json({ error: 'Internal Server Error: ' + error.message }, { status: 500 });
    }
}
