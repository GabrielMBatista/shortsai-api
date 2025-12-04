import { createVideoJob } from "@/lib/services/job-runner";
import { NextResponse } from "next/server";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const body = await req.json();

    // Chama o service que criamos no Passo 2
    const job = await createVideoJob(id, body.projectId, body);

    // Retorna 202 Accepted imediatamente
    return NextResponse.json({
        success: true,
        jobId: job.id,
        status: "QUEUED"
    }, { status: 202 });
}
