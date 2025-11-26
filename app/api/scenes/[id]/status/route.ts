import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { SceneStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const { type, status, force_regen } = body;

        if (!type || !['image', 'audio', 'sfx'].includes(type)) {
            return NextResponse.json({ error: 'Invalid or missing asset type' }, { status: 400 });
        }

        if (!status || !Object.values(SceneStatus).includes(status)) {
            return NextResponse.json({ error: 'Invalid or missing status' }, { status: 400 });
        }

        // Fetch scene and project
        const scene = await prisma.scene.findUnique({
            where: { id },
            include: { project: true },
        });

        if (!scene) {
            return NextResponse.json({ error: 'Scene not found' }, { status: 404 });
        }

        // 1. Validate Project Status
        if (scene.project.status !== 'generating') {
            return NextResponse.json({
                error: `Project status is ${scene.project.status}, must be 'generating'`,
            }, { status: 400 });
        }

        // 2. Validate Transition & Force Regen
        const currentStatus = scene[`${type}_status` as keyof typeof scene] as SceneStatus;

        if (currentStatus === 'completed' && status === 'loading' && !force_regen) {
            return NextResponse.json({
                error: 'Asset already exists. Use force_regen: true to overwrite.',
                code: 'ASSET_EXISTS'
            }, { status: 409 });
        }

        // 3. Prepare Update Data
        const updateData: any = {
            [`${type}_status`]: status,
        };

        // Increment attempts if starting generation
        if (status === 'loading') {
            const attemptsField = `${type}_attempts` as keyof typeof scene;
            // Check limits (example: max 3 attempts)
            // const currentAttempts = scene[attemptsField] as number;
            // if (currentAttempts >= 3 && !force_regen) {
            //      return NextResponse.json({ error: 'Max attempts reached' }, { status: 400 });
            // }
            updateData[attemptsField] = { increment: 1 };

            // Clear error message on new attempt
            updateData.error_message = null;
        }

        // 4. Atomic Update
        const updatedScene = await prisma.scene.update({
            where: { id },
            data: updateData,
        });

        return NextResponse.json(updatedScene);

    } catch (error: any) {
        console.error('Error updating scene status:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
