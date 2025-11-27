import { NextResponse } from 'next/server';
import { WorkflowService, WorkflowCommand } from '@/lib/workflow/workflow-service';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const command: WorkflowCommand = body;

        if (!command.projectId || !command.action) {
            return NextResponse.json({ error: 'Missing projectId or action' }, { status: 400 });
        }

        const result = await WorkflowService.handleCommand(command);
        return NextResponse.json(result);

    } catch (error: any) {
        console.error('Workflow Command Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
