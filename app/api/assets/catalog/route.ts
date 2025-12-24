import { NextRequest, NextResponse } from 'next/server';
import { assetLibraryService } from '@/lib/assets/asset-library-service';
import { AssetType } from '@prisma/client';

/**
 * POST /api/assets/catalog/initialize
 * Catalogar todos os assets existentes (one-time setup)
 */
export async function POST(req: NextRequest) {
    try {
        const result = await assetLibraryService.catalogExistingAssets();

        return NextResponse.json({
            success: true,
            message: `Catalogação concluída com sucesso`,
            data: result,
        });
    } catch (error: any) {
        console.error('Error cataloging assets:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}

/**
 * GET /api/assets/catalog
 * Listar assets catalogados
 */
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const skip = parseInt(searchParams.get('skip') || '0');
        // Aceitar tanto 'take' quanto 'limit' (frontend usa 'limit')
        const take = parseInt(searchParams.get('take') || searchParams.get('limit') || '20');
        const assetType = searchParams.get('assetType') as AssetType | null;
        const category = searchParams.get('category');

        console.log('[AssetCatalog] GET request - skip:', skip, 'take:', take, 'assetType:', assetType);

        const result = await assetLibraryService.listAssets({
            skip,
            take,
            assetType: assetType || undefined,
            category: category || undefined,
        });

        console.log('[AssetCatalog] Returning', result.assets.length, 'assets out of', result.total, 'total');

        return NextResponse.json({
            success: true,
            data: result,
        });
    } catch (error: any) {
        console.error('Error listing assets:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
