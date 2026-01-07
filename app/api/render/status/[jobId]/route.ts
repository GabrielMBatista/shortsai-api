import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/render/status/[jobId]
 * Get render job status
 */
export async function GET(
    req: NextRequest,
    { params }: { params: { jobId: string } }
) {
    try {
        const { jobId } = params;

        const job = await prisma.job.findUnique({
            where: { id: jobId }
        });

        if (!job) {
            return NextResponse.json(
                { success: false, error: 'Job not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            job: {
                id: job.id,
                status: job.status,
                outputResult: job.outputResult,
                errorMessage: job.errorMessage,
                createdAt: job.createdAt,
                updatedAt: job.updatedAt
            }
        });

    } catch (error: any) {
        console.error('[API /render/status] Error:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
