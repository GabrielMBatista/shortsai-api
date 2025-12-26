import { NextRequest, NextResponse } from 'next/server';
import { assetLibraryService } from '@/lib/assets/asset-library-service';
import { AssetType } from '@prisma/client';
import { auth } from '@/lib/auth';

export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const description = searchParams.get('description');
        const type = (searchParams.get('type') || 'VIDEO') as AssetType;
        const minSimilarity = parseFloat(searchParams.get('minSimilarity') || '0.1');

        if (!description) {
            return NextResponse.json({ error: 'Description is required' }, { status: 400 });
        }

        console.log(`[AssetSearch] Searching for ${type} compatible with: "${description.substring(0, 50)}..."`);

        const matches = await assetLibraryService.findCompatibleAssets({
            description,
            assetType: type,
            minSimilarity: 0.0, // Force return all candidates even if poor match
            excludeRecentlyUsed: false // No seletor manual, mostramos tudo
        });

        return NextResponse.json({
            matches: matches.map(m => ({
                id: m.id,
                url: m.url,
                // @ts-ignore
                type: m.asset_type || (m.url.includes('.mp4') ? 'VIDEO' : 'IMAGE'), // Fallback if property missing
                similarity: Math.round(m.similarity * 100),
                description: m.description,
                tags: m.tags,
                category: m.category,
                duration: m.duration_seconds,
                thumbnail_url: m.thumbnail_url
            }))
        });
    } catch (error) {
        console.error('[AssetSearch] Error:', error);
        return NextResponse.json({ error: 'Failed to search assets' }, { status: 500 });
    }
}
