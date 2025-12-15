import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { importMetricsFromCSV } from '@/lib/youtube-analytics/analytics-service';
import { validateCSVStructure } from '@/lib/youtube-analytics/csv-parser';
import { prisma } from '@/lib/prisma';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * POST /api/youtube-analytics/import
 * Import YouTube metrics from CSV file
 */
export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const formData = await req.formData();
        const file = formData.get('file') as File;
        const channelId = formData.get('channelId') as string;

        if (!file || !channelId) {
            return NextResponse.json(
                { error: 'Missing file or channelId' },
                { status: 400 }
            );
        }

        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` },
                { status: 400 }
            );
        }

        // Validate channel ownership
        const channel = await prisma.channel.findFirst({
            where: {
                id: channelId,
                userId: session.user.id,
            },
        });

        if (!channel) {
            return NextResponse.json(
                { error: 'Channel not found or unauthorized' },
                { status: 404 }
            );
        }

        // Read file content
        const content = await file.text();

        // Validate CSV structure
        const validation = validateCSVStructure(content);
        if (!validation.valid) {
            return NextResponse.json(
                {
                    error: 'Invalid CSV structure',
                    missingColumns: validation.missingColumns,
                },
                { status: 400 }
            );
        }

        // Import metrics
        const result = await importMetricsFromCSV(
            channelId,
            session.user.id,
            file.name,
            content
        );

        return NextResponse.json({
            success: true,
            batchId: result.batchId,
            stats: result.stats,
        });
    } catch (error) {
        console.error('Import error:', error);
        return NextResponse.json(
            {
                error: error instanceof Error ? error.message : 'Import failed',
            },
            { status: 500 }
        );
    }
}
