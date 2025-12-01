import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import archiver from 'archiver';
import { Readable } from 'stream';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        // 1. Fetch Project Data
        const project = await prisma.project.findUnique({
            where: { id },
            include: {
                scenes: {
                    orderBy: { scene_number: 'asc' },
                },
            },
        });

        if (!project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        // 2. Prepare Archive
        const archive = archiver('zip', {
            zlib: { level: 9 }, // Sets the compression level.
        });

        // 3. Add Script JSON
        const scriptData = {
            title: project.generated_title,
            description: project.generated_description,
            scenes: project.scenes.map((scene) => ({
                scene_number: scene.scene_number,
                narration: scene.narration,
                visual_description: scene.visual_description,
                image_url: scene.image_url,
                audio_url: scene.audio_url,
            })),
            metadata: {
                topic: project.topic,
                style: project.style,
                voice: project.voice_name,
                created_at: project.created_at,
            },
        };

        archive.append(JSON.stringify(scriptData, null, 2), { name: 'script.json' });

        // 4. Add SEO info
        const seoContent = `Title: ${project.generated_title || ''}\nDescription: ${project.generated_description || ''}\nKeywords: ${project.topic}, ${project.style}`;
        archive.append(seoContent, { name: 'seo.txt' });

        // 5. Add Assets (Images and Audio)
        const fetchAndAppend = async (url: string, name: string) => {
            try {
                const response = await fetch(url);
                if (response.ok) {
                    const arrayBuffer = await response.arrayBuffer();
                    archive.append(Buffer.from(arrayBuffer), { name });
                } else {
                    console.error(`Failed to fetch ${url}: ${response.statusText}`);
                    archive.append(`Failed to fetch: ${url} - ${response.statusText}`, { name: `${name}.error.txt` });
                }
            } catch (e) {
                console.error(`Error fetching ${url}:`, e);
                archive.append(`Error fetching: ${url}\n${e}`, { name: `${name}.error.txt` });
            }
        };

        const assetPromises: Promise<void>[] = [];

        for (const scene of project.scenes) {
            if (scene.image_url) {
                let ext = 'png';
                try {
                    const urlPath = new URL(scene.image_url).pathname;
                    const possibleExt = urlPath.split('.').pop();
                    if (possibleExt && ['png', 'jpg', 'jpeg', 'webp'].includes(possibleExt.toLowerCase())) {
                        ext = possibleExt;
                    }
                } catch (e) { }

                assetPromises.push(fetchAndAppend(scene.image_url, `scenes/scene_${scene.scene_number}_image.${ext}`));
            }
            if (scene.audio_url) {
                let ext = 'mp3';
                try {
                    const urlPath = new URL(scene.audio_url).pathname;
                    const possibleExt = urlPath.split('.').pop();
                    if (possibleExt && ['mp3', 'wav', 'ogg'].includes(possibleExt.toLowerCase())) {
                        ext = possibleExt;
                    }
                } catch (e) { }
                assetPromises.push(fetchAndAppend(scene.audio_url, `scenes/scene_${scene.scene_number}_audio.${ext}`));
            }
        }

        await Promise.all(assetPromises);

        archive.finalize();

        // 6. Return Response
        // @ts-ignore
        const webStream = Readable.toWeb(archive);

        return new NextResponse(webStream as any, {
            headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="project-${project.generated_title?.replace(/[^a-z0-9]/gi, '_').toLowerCase() || project.id}.zip"`,
            },
        });

    } catch (error) {
        console.error('Export error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
