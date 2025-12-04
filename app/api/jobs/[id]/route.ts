import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    const job = await prisma.job.findUnique({
        where: { id }
    });

    if (!job) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json(job);
}
