import { NextResponse } from 'next/server';
import { AIService } from '@/lib/ai/ai-service';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { userId, image, apiKeys } = body;

        if (!userId || !image) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const result = await AIService.optimizeReferenceImage(userId, image, apiKeys);

        return NextResponse.json({ result });
    } catch (error: any) {
        console.error('Image optimization failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
