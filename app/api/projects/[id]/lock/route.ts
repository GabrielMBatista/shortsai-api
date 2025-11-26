import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const { session_id } = body;

        if (!session_id) {
            return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
        }

        // Transaction to check and acquire lock
        const result = await prisma.$transaction(async (tx) => {
            const project = await tx.project.findUnique({
                where: { id },
            });

            if (!project) {
                throw new Error('Project not found');
            }

            const now = new Date();
            const isLocked = project.lock_expires_at && project.lock_expires_at > now;

            if (isLocked && project.lock_session_id !== session_id) {
                throw new Error('Project is locked by another session');
            }

            // Lock for 5 minutes (or configurable)
            const expiresAt = new Date(now.getTime() + 5 * 60 * 1000);

            const updatedProject = await tx.project.update({
                where: { id },
                data: {
                    lock_session_id: session_id,
                    lock_expires_at: expiresAt,
                    status: 'generating',
                },
            });

            return updatedProject;
        });

        return NextResponse.json(result);
    } catch (error: any) {
        if (error.message === 'Project is locked by another session') {
            return NextResponse.json({ error: error.message }, { status: 409 });
        }
        if (error.message === 'Project not found') {
            return NextResponse.json({ error: error.message }, { status: 404 });
        }
        console.error('Error locking project:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
