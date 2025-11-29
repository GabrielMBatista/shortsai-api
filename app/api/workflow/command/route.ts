import { NextResponse } from 'next/server';
import { WorkflowService, WorkflowCommand } from '@/lib/workflow/workflow-service';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const command: WorkflowCommand = body;

        if (!command.projectId || !command.action) {
            return NextResponse.json({ error: 'Missing projectId or action' }, { status: 400 });
        }

        // Verify project ownership
        const project = await prisma.project.findUnique({
            where: { id: command.projectId },
            select: { user_id: true }
        });

        if (!project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        if (project.user_id !== session.user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const result = await WorkflowService.handleCommand(command);
        return NextResponse.json(result);

    } catch (error: any) {
        console.error('Workflow Command Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
