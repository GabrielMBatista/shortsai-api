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

        const usageLog = await prisma.usageLog.create({
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
            },
        });

        return NextResponse.json(usageLog, { status: 201 });
    } catch (error: any) {
        console.error('Error creating usage log:', error);
        return NextResponse.json(
            { error: 'Failed to create usage log', details: error.message },
            { status: 500 }
        );
    }
}
