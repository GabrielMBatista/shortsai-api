import { NextRequest, NextResponse } from 'next/server';
import { assetLibraryService } from '@/lib/assets/asset-library-service';

interface RouteParams {
    params: {
        id: string;
    };
}

/**
 * POST /api/assets/catalog/[id]/track-reuse
 * Registrar que um asset foi reutilizado
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
    try {
        const { id } = params;
        const body = await req.json();
        const { channelId } = body;

        await assetLibraryService.trackAssetReuse(id, channelId);

        return NextResponse.json({
            success: true,
            message: 'Asset reuse tracked successfully',
        });
    } catch (error: any) {
        console.error('Error tracking asset reuse:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
