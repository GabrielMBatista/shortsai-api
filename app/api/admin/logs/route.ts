import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

export async function GET(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const currentUser = await prisma.user.findUnique({ where: { email: session.user.email } });
        if ((currentUser as any)?.role !== 'ADMIN') return NextResponse.json({ error: "Forbidden" }, { status: 403 });

        const { searchParams } = new URL(req.url);
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '50');
        const status = searchParams.get('status'); // 'success' | 'failed' | 'all'
        const action = searchParams.get('action');
        const search = searchParams.get('search')?.trim();

        const skip = (page - 1) * limit;

        const where: Prisma.UsageLogWhereInput = {};

        if (status && status !== 'ALL') {
            where.status = status as any;
        }

        if (action && action !== 'ALL') {
            where.action_type = action as any;
        }

        if (search) {
            // Smart Search: Resolve User IDs from email/name to search in error messages
            const relatedUsers = await prisma.user.findMany({
                where: {
                    OR: [
                        { email: { contains: search, mode: 'insensitive' } },
                        { name: { contains: search, mode: 'insensitive' } }
                    ]
                },
                select: { id: true },
                take: 5
            });
            const relatedIds = relatedUsers.map(u => u.id);

            where.OR = [
                { error_message: { contains: search, mode: 'insensitive' } },
                { user: { email: { contains: search, mode: 'insensitive' } } },
                { user: { name: { contains: search, mode: 'insensitive' } } },
                { user: { id: { contains: search, mode: 'insensitive' } } },
                { project: { id: { contains: search, mode: 'insensitive' } } },
                { user_id: { in: relatedIds } },
                // Also find logs where the error message contains the ID of the user found by email/name
                ...relatedIds.map(id => ({ error_message: { contains: id } }))
            ];
        }

        const [logs, total] = await Promise.all([
            prisma.usageLog.findMany({
                where,
                include: {
                    user: {
                        select: {
                            name: true,
                            email: true,
                            avatar_url: true
                        }
                    },
                    project: {
                        select: {
                            topic: true,
                            id: true
                        }
                    }
                },
                orderBy: {
                    created_at: 'desc'
                },
                skip,
                take: limit
            }),
            prisma.usageLog.count({ where })
        ]);

        return NextResponse.json({
            logs,
            pagination: {
                total,
                pages: Math.ceil(total / limit),
                current: page,
                limit
            }
        });

    } catch (error) {
        console.error("Admin Logs GET Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
