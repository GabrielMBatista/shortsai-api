
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const body = await request.json();
        const plan = await prisma.plan.update({
            where: { id: params.id },
            data: {
                name: body.name,
                slug: body.slug,
                description: body.description,
                price: body.price,
                monthly_images_limit: body.monthly_images_limit,
                monthly_videos_limit: body.monthly_videos_limit,
                monthly_minutes_tts: body.monthly_minutes_tts,
                daily_requests_limit: body.daily_requests_limit,
                daily_videos_limit: body.daily_videos_limit,
                features: body.features
            }
        });
        return NextResponse.json(plan);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        await prisma.plan.delete({
            where: { id: params.id }
        });
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
