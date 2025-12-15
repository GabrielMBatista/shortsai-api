import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { MetadataService } from '@/lib/ai/services/metadata-service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/ai/metadata
 * Generate optimized metadata (title, description, hashtags) for a video
 * 
 * Body:
 * {
 *   videoTitle: string,
 *   videoContent: string,
 *   channelId?: string,
 *   language?: string
 * }
 */
export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { videoTitle, videoContent, channelId, language } = body;

        if (!videoTitle || !videoContent) {
            return NextResponse.json(
                { error: 'Missing required fields: videoTitle, videoContent' },
                { status: 400 }
            );
        }

        const metadata = await MetadataService.generateOptimizedMetadata(
            session.user.id,
            videoTitle,
            videoContent,
            channelId,
            language || 'pt-BR'
        );

        return NextResponse.json(metadata);
    } catch (error: any) {
        console.error('[API /ai/metadata] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to generate metadata' },
            { status: 500 }
        );
    }
}
