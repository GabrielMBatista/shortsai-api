import { NextRequest, NextResponse } from 'next/server';
import { assetLibraryService } from '@/lib/assets/asset-library-service';

/**
 * GET /api/assets/catalog/stats
 * Obter estatísticas de reuso
 */
export async function GET(req: NextRequest) {
    try {
        const stats = await assetLibraryService.getReuseStats();

        return NextResponse.json({
            success: true,
            data: stats,
        });
    } catch (error: any) {
        console.error('Error getting reuse stats:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
