import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const folderId = searchParams.get('folderId');
        const tag = searchParams.get('tag');
        const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 50;

        const user_id = session.user.id;

        const whereClause: any = {
            user_id,
            is_archived: false,
        };

        if (folderId) {
            if (folderId === 'root') {
                whereClause.folder_id = null;
            } else {
                whereClause.folder_id = folderId;
            }
        }

        if (tag) {
            whereClause.tags = { has: tag };
        }

        const projects = await prisma.project.findMany({
            where: whereClause,
            take: limit,
            orderBy: { created_at: 'desc' },
            select: {
                topic: true,
                style: true,
                voice_name: true,
                generated_title: true,
                generated_description: true,
                scenes: {
                    select: {
                        visual_description: true,
                        narration: true,
                    },
                    orderBy: { scene_number: 'asc' }
                }
            }
        });

        const contextData = {
            meta: {
                generated_at: new Date().toISOString(),
                project_count: projects.length,
                filter: { folderId, tag }
            },
            style_reference: {
                common_styles: [...new Set(projects.map(p => p.style))],
                preferred_voices: [...new Set(projects.map(p => p.voice_name))],
            },
            content_examples: projects.map(p => ({
                title: p.generated_title || p.topic,
                description: p.generated_description,
                script_sample: p.scenes.map(s => s.narration).join(" "),
                visual_style_sample: p.scenes.slice(0, 3).map(s => s.visual_description)
            }))
        };

        return NextResponse.json(contextData);
    } catch (error: any) {
        console.error('Error exporting context:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
