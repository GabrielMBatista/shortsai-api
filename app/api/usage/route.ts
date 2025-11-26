import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { UsageLogAction, UsageLogStatus } from '@prisma/client';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            user_id,
            project_id,
            action_type,
            provider,
            model_name,
            tokens_input,
            tokens_output,
            status,
            error_message,
            duration_seconds
        } = body;

        if (!user_id || !action_type || !provider) {
            return NextResponse.json(
                { error: 'Missing required fields: user_id, action_type, provider' },
                { status: 400 }
            );
        }

        // Validate enums if possible, or let Prisma throw error (but better to handle gracefully)
        // We can cast to the enum types for now, assuming the client sends correct values.
        // If the client sends invalid enum values, Prisma will throw.

        // Idempotency check
        if (body.idempotency_key) {
            const existingLog = await prisma.usageLog.findUnique({
                where: { idempotency_key: body.idempotency_key },
            });
            if (existingLog) {
                return NextResponse.json(existingLog, { status: 200 });
            }
        }

        // Transaction: Create Log + Update User Limits
        const result = await prisma.$transaction(async (tx) => {
            const newLog = await tx.usageLog.create({
                data: {
                    user_id,
                    project_id: project_id || null,
                    action_type: action_type as UsageLogAction,
                    provider,
                    model_name: model_name || 'unknown',
                    tokens_input: tokens_input || 0,
                    tokens_output: tokens_output || 0,
                    status: status as UsageLogStatus,
                    error_message: error_message || null,
                    duration_seconds: duration_seconds || 0,
                    idempotency_key: body.idempotency_key || null,
                },
            });

            // Only update limits if the action was successful
            if (status === 'success' && user_id) {
                // Initialize limits if not exist
                let userLimits = await tx.userLimits.findUnique({ where: { user_id } });
                if (!userLimits) {
                    userLimits = await tx.userLimits.create({ data: { user_id } });
                }

                const updateData: any = {};

                // Map action types to limit fields
                // This logic depends on how you want to count usage.
                // Assuming:
                // GENERATE_SCRIPT -> No specific limit in schema, maybe just tokens?
                // GENERATE_IMAGE -> current_images_used
                // GENERATE_TTS -> current_minutes_tts_used
                // GENERATE_MUSIC -> maybe video limit or separate? Assuming video for now or none.

                if (action_type === 'GENERATE_IMAGE') {
                    updateData.current_images_used = { increment: 1 };
                } else if (action_type === 'GENERATE_TTS') {
                    // duration_seconds is in seconds, convert to minutes
                    const minutes = (duration_seconds || 0) / 60;
                    updateData.current_minutes_tts_used = { increment: minutes };
                }
                // Add other cases as needed

                if (Object.keys(updateData).length > 0) {
                    await tx.userLimits.update({
                        where: { user_id },
                        data: updateData,
                    });
                }
            }

            return newLog;
        });

        return NextResponse.json(result, { status: 201 });
    } catch (error: any) {
        console.error('Error creating usage log:', error);
        return NextResponse.json(
            { error: 'Failed to create usage log', details: error.message },
            { status: 500 }
        );
    }
}
