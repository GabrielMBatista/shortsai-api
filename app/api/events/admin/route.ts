import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addConnection, removeConnection, ADMIN_CHANNEL } from "@/lib/sse/sse-service";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
    const session = await auth();
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if ((user as any)?.role !== 'ADMIN') {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const stream = new ReadableStream({
        start(controller) {
            addConnection(ADMIN_CHANNEL, controller);

            // Send initial connection message
            const encoder = new TextEncoder();
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected' })}\n\n`));
        },
        cancel(controller) {
            removeConnection(ADMIN_CHANNEL, controller);
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}
