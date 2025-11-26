import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function POST(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const { id } = params;
        const body = await request.json();
        const { session_id, status } = body; // Optional status update on unlock (e.g., 'completed' or 'failed')

        if (!session_id) {
            return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
        }

        const project = await prisma.project.findUnique({
            where: { id },
        });

        if (!project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        // Only the lock owner can unlock, unless lock expired
        const now = new Date();
        const isLocked = project.lock_expires_at && project.lock_expires_at > now;

        if (isLocked && project.lock_session_id !== session_id) {
            return NextResponse.json({ error: 'Cannot unlock: locked by another session' }, { status: 403 });
        }

        const updatedProject = await prisma.project.update({
            where: { id },
            data: {
                lock_session_id: null,
                lock_expires_at: null,
                ...(status && { status }), // Update status if provided (e.g. completed)
            },
        });

        return NextResponse.json(updatedProject);
    } catch (error: any) {
        console.error('Error unlocking project:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
