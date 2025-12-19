import { NextRequest, NextResponse } from 'next/server';
import { assetLibraryService } from '@/lib/assets/asset-library-service';
import { AssetType } from '@prisma/client';

/**
 * POST /api/assets/catalog/search
 * Buscar assets compatíveis com uma descrição
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            description,
            assetType,
            channelId,
            excludeRecentlyUsed = true,
            minSimilarity = 0.75,
        } = body;

        if (!description || !assetType) {
            return NextResponse.json(
                { success: false, error: 'description and assetType are required' },
                { status: 400 }
            );
        }

        const matches = await assetLibraryService.findCompatibleAssets({
            description,
            assetType: assetType as AssetType,
            channelId,
            excludeRecentlyUsed,
            minSimilarity,
        });

        return NextResponse.json({
            success: true,
            data: {
                matches,
                count: matches.length,
            },
        });
    } catch (error: any) {
        console.error('Error searching assets:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
