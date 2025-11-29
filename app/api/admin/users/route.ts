import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const currentUser = await prisma.user.findUnique({ where: { email: session.user.email } });
        if ((currentUser as any)?.role !== 'ADMIN') return NextResponse.json({ error: "Forbidden" }, { status: 403 });

        const users = await prisma.user.findMany({
            orderBy: { created_at: 'desc' },
            include: {
                _count: {
                    select: { projects: true }
                },
                user_limits: true
            }
        });

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
