import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const currentUser = await prisma.user.findUnique({ where: { email: session.user.email } });
        if ((currentUser as any)?.role !== 'ADMIN') return NextResponse.json({ error: "Forbidden" }, { status: 403 });

        const { searchParams } = new URL(req.url);
        const search = searchParams.get('search') || '';
        const role = searchParams.get('role');
        const plan = searchParams.get('plan');
        const status = searchParams.get('status'); // 'active' | 'blocked'
        const sort = searchParams.get('sort') || 'created_at';
        const order = searchParams.get('order') || 'desc';

        const where: any = {};

        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } }
            ];
        }

        if (role && role !== 'ALL') where.role = role;
        if (plan && plan !== 'ALL') where.subscription_plan = plan;
        if (status && status !== 'ALL') {
            where.is_blocked = status === 'blocked';
        }

        const orderBy: any = {};
        if (sort === 'projects') {
            // Prisma doesn't support direct sorting by relation count in findMany easily without aggregate or raw query.
            // For simplicity, we fallback to created_at if projects is selected, or handle in-memory if dataset is small.
            // Given typical admin usage, let's default to created_at for now to avoid complex queries, 
            // or just ignore it in the DB query and let the frontend sort if needed, 
            // BUT the user asked for "order by in tables", implying backend support is better.
            // Let's stick to simple field sorting for DB.
            orderBy.created_at = 'desc';
        } else {
            orderBy[sort] = order;
        }

        const users = await prisma.user.findMany({
            where,
            orderBy,
            include: {
                _count: {
                    select: { projects: true }
                },
                user_limits: true
            }
        });

        // If sorting by projects, do it in memory since we have the count
        if (sort === 'projects') {
            users.sort((a, b) => {
                const countA = a._count.projects;
                const countB = b._count.projects;
                return order === 'asc' ? countA - countB : countB - countA;
            });
        }

        return NextResponse.json(users);
    } catch (error) {
        console.error("Admin Users GET Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const currentUser = await prisma.user.findUnique({ where: { email: session.user.email } });
        if ((currentUser as any)?.role !== 'ADMIN') return NextResponse.json({ error: "Forbidden" }, { status: 403 });

        const body = await req.json();
        const { userId, role, subscription_plan, is_blocked } = body;

        if (!userId) return NextResponse.json({ error: "User ID required" }, { status: 400 });

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: {
                role,
                subscription_plan,
                tier: subscription_plan === 'PRO' ? 'pro' : 'free',
                is_blocked
            }
        });

        return NextResponse.json(updatedUser);
    } catch (error) {
        console.error("Admin Users PATCH Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
