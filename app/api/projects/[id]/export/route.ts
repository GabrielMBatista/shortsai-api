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

        // 3. Prepare Project JSON Data
        const projectJsonScenes = [];
        const assetPromises: Promise<void>[] = [];

        const fetchAndAppend = async (url: string, name: string) => {
            try {
                const response = await fetch(url);
                if (response.ok) {
                    const arrayBuffer = await response.arrayBuffer();
                    archive.append(Buffer.from(arrayBuffer), { name });
                } else {
                    console.error(`Failed to fetch ${url}: ${response.statusText}`);
                    // Don't append error files to keep structure clean, just log
                }
            } catch (e) {
                console.error(`Error fetching ${url}:`, e);
            }
        };

        for (const scene of project.scenes) {
            const sceneId = `scene_${scene.scene_number.toString().padStart(2, '0')}`;

            // Determine extensions
            let imgExt = 'png';
            if (scene.image_url) {
                try {
                    const urlPath = new URL(scene.image_url).pathname;
                    const possibleExt = urlPath.split('.').pop();
                    if (possibleExt && ['png', 'jpg', 'jpeg'].includes(possibleExt.toLowerCase())) {
                        imgExt = possibleExt;
                    }
                } catch (e) { }
            }

            let audioExt = 'mp3';
            if (scene.audio_url) {
                try {
                    const urlPath = new URL(scene.audio_url).pathname;
                    const possibleExt = urlPath.split('.').pop();
                    if (possibleExt && ['mp3', 'wav'].includes(possibleExt.toLowerCase())) {
                        audioExt = possibleExt;
                    }
                } catch (e) { }
            }

            // Add to project.json scenes list
            projectJsonScenes.push({
                id: sceneId,
                prompt: scene.visual_description || `Scene ${scene.scene_number}`,
                audio: `audio/${sceneId}.${audioExt}`,
                image: `images/${sceneId}.${imgExt}`
            });

            // Queue downloads
            if (scene.image_url) {
                assetPromises.push(fetchAndAppend(scene.image_url, `images/${sceneId}.${imgExt}`));
            }
            if (scene.audio_url) {
                assetPromises.push(fetchAndAppend(scene.audio_url, `audio/${sceneId}.${audioExt}`));
            }
        }

        const projectJson = {
            projectName: project.generated_title || project.topic || "Untitled Project",
            scenes: projectJsonScenes
        };

        // Append project.json
        archive.append(JSON.stringify(projectJson, null, 2), { name: 'project.json' });

        // Wait for all assets to be downloaded and appended
        await Promise.all(assetPromises);

        archive.finalize();

        // 4. Return Response
        // @ts-ignore
        const webStream = Readable.toWeb(archive);

        return new NextResponse(webStream as any, {
            headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="project-${(project.generated_title || 'export').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.zip"`,
            },
        });

    } catch (error) {
        console.error('Export error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
