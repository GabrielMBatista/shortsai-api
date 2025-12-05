
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth"; // Presumindo NextAuth v5
import { NextResponse } from "next/server";
import { z } from "zod";

// Schema de validação
const createShowSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  description: z.string().optional(),
  style_preset: z.enum(["Cinematic", "Anime", "3D Animation", "Comic Book", "Realism"]).optional(),
  visual_prompt: z.string().optional(),
  default_tts_provider: z.enum(["gemini", "elevenlabs", "groq"]).optional()
});

// GET /api/shows - Listar shows do usuário
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const shows = await prisma.show.findMany({
      where: { user_id: session.user.id },
      include: {
        _count: {
            select: { episodes: true, characters: true }
        }
      },
      orderBy: { updated_at: 'desc' }
    });

    return NextResponse.json(shows);
  } catch (error) {
    console.error("Error fetching shows:", error);
    return NextResponse.json({ error: "Failed to fetch shows" }, { status: 500 });
  }
}

// POST /api/shows - Criar novo show
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const json = await req.json();
    const body = createShowSchema.parse(json);

    const show = await prisma.show.create({
      data: {
        user_id: session.user.id,
        name: body.name,
        description: body.description || "",
        style_preset: body.style_preset || "Cinematic",
        visual_prompt: body.visual_prompt,
        default_tts_provider: body.default_tts_provider as any || "gemini"
      }
    });

    return NextResponse.json(show, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error("Error creating show:", error);
    return NextResponse.json({ error: "Failed to create show" }, { status: 500 });
  }
}
