import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const currentUser = await prisma.user.findUnique({ where: { email: session.user.email } });
        if ((currentUser as any)?.role !== 'ADMIN') return NextResponse.json({ error: "Forbidden" }, { status: 403 });

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const [totalUsers, totalProjects, totalScenes, recentUsers, recentProjectsList] = await Promise.all([
            prisma.user.count(),
            prisma.project.count(),
            prisma.scene.count(),
            prisma.user.findMany({
                where: { created_at: { gte: thirtyDaysAgo } },
                select: { created_at: true }
            }),
            prisma.project.findMany({
                where: { created_at: { gte: thirtyDaysAgo } },
                select: { created_at: true }
            })
        ]);

        // Process for charts
        const formatDate = (date: Date) => date.toISOString().split('T')[0];
        const analyticsMap = new Map<string, { date: string, users: number, projects: number }>();

        // Initialize last 30 days
        for (let i = 0; i < 30; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = formatDate(d);
            analyticsMap.set(key, { date: key, users: 0, projects: 0 });
        }

        recentUsers.forEach(u => {
            const key = formatDate(u.created_at);
            if (analyticsMap.has(key)) analyticsMap.get(key)!.users++;
        });

        recentProjectsList.forEach(p => {
            const key = formatDate(p.created_at);
            if (analyticsMap.has(key)) analyticsMap.get(key)!.projects++;
        });

        const analytics = Array.from(analyticsMap.values()).sort((a, b) => a.date.localeCompare(b.date));

        const recentProjects = await prisma.project.findMany({
            take: 5,
            orderBy: { created_at: 'desc' },
            include: { user: { select: { name: true, email: true } } }
        });

        return NextResponse.json({
            totalUsers,
            totalProjects,
            totalScenes,
            recentProjects,
            analytics
        });
    } catch (error) {
        console.error("Admin Stats GET Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
