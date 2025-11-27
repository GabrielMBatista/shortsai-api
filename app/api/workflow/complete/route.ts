import { NextResponse } from 'next/server';
import { WorkflowService } from '@/lib/workflow/workflow-service';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { projectId, sceneId, type, status, outputUrl, error } = body;

        if (!projectId || !sceneId || !type || !status) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        await WorkflowService.completeTask(projectId, sceneId, type, status, outputUrl, error);
        return NextResponse.json({ message: 'Task completed' });

    } catch (error: any) {
        console.error('Workflow Complete Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
