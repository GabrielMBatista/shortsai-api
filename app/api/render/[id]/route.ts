
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const params = await context.params;
        const { id } = params;

        const job = await prisma.job.findUnique({
            where: { id }
        });

        if (!job) {
            return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }

        // Map Prisma Job to Frontend Expected Shape
        const output = job.outputResult as any || {};

        const response: any = {
            id: job.id,
            status: job.status,
            progress: output.progress || 0, // Read from JSON
            eta: output.eta || null,
        };

        if (output.url) {
            response.resultUrl = output.url;
        }

        if (job.errorMessage) {
            response.error = job.errorMessage;
        }

        return NextResponse.json(response);

    } catch (e: any) {
        console.error("Get Job Error", e);
        return NextResponse.json({ error: 'Server error: ' + e.message }, { status: 500 });
    }
}
