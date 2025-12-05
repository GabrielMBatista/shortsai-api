
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

// Métodos para Item Individual: GET, PATCH, DELETE

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
  const { id } = await params;

  const show = await prisma.show.findUnique({
    where: { id },
    include: {
        characters: true,
        episodes: {
            take: 5,
            orderBy: { created_at: 'desc' },
            select: { id: true, topic: true, status: true, created_at: true }
        }
    }
  });

  if (!show) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (show.user_id !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json(show);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const json = await req.json();

    // Verifica propriedade
    const existingShow = await prisma.show.findUnique({ where: { id } });
    if (!existingShow) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existingShow.user_id !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    try {
        const updated = await prisma.show.update({
            where: { id },
            data: {
                name: json.name,
                description: json.description,
                style_preset: json.style_preset,
                visual_prompt: json.visual_prompt,
                default_tts_provider: json.default_tts_provider
            }
        });
        return NextResponse.json(updated);
    } catch (e) {
        return NextResponse.json({ error: "Failed update" }, { status: 500 });
    }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    const { id } = await params;

    const existingShow = await prisma.show.findUnique({ where: { id } });
    if (!existingShow) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existingShow.user_id !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await prisma.show.delete({ where: { id } });
    return NextResponse.json({ success: true });
}
