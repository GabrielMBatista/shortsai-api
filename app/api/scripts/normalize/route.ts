import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { normalizeScriptFormat } from '@/lib/ai/core/json-normalizer';

export const dynamic = 'force-dynamic';

/**
 * POST /api/scripts/normalize
 * Normaliza um JSON de roteiro para o formato padrão do sistema
 * Usa o mesmo normalizador que o backend usa na geração de roteiros
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { scriptJson, fallbackTopic } = body;

        if (!scriptJson) {
            return NextResponse.json({ error: 'scriptJson is required' }, { status: 400 });
        }

        // Usar o mesmo normalizador do backend
        const normalized = normalizeScriptFormat(scriptJson, fallbackTopic || 'Untitled');

        return NextResponse.json({
            success: true,
            normalized
        });

    } catch (error: any) {
        console.error('[POST /api/scripts/normalize] Error:', error);
        return NextResponse.json(
            {
                success: false,
                error: error.message || 'Failed to normalize script format'
            },
            { status: 500 }
        );
    }
}
