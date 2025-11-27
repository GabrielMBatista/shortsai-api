import { NextResponse } from 'next/server';
import { WorkflowService } from '@/lib/workflow/workflow-service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const projectId = searchParams.get('projectId');

        if (!projectId) {
            return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
        }

        const task = await WorkflowService.getNextTask(projectId);

        // Return 204 if no task, or 200 with task
        if (!task) {
            return new NextResponse(null, { status: 204 });
        }

        return NextResponse.json(task);

    } catch (error: any) {
        console.error('Workflow Poll Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
