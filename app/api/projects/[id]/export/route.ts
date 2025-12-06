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
                }
            } catch (e) {
                console.error(`Error fetching ${url}:`, e);
            }
        };

        // Helper to extract extension
        const getExtension = (urlStr: string, defaultExt: string, allowed: string[]) => {
            try {
                const urlPath = new URL(urlStr).pathname;
                const possibleExt = urlPath.split('.').pop();
                if (possibleExt && allowed.includes(possibleExt.toLowerCase())) {
                    return possibleExt.toLowerCase();
                }
            } catch (e) { }
            return defaultExt;
        };

        // Handle Background Music
        let bgMusicPath = null;
        if (project.bg_music_url) {
            const ext = getExtension(project.bg_music_url, 'mp3', ['mp3', 'wav', 'm4a']);
            bgMusicPath = `audio/background.${ext}`;
            assetPromises.push(fetchAndAppend(project.bg_music_url, bgMusicPath));
        }

        // Handle Reference Image
        let refImagePath = null;
        if (project.reference_image_url) {
            const ext = getExtension(project.reference_image_url, 'png', ['png', 'jpg', 'jpeg', 'webp']);
            refImagePath = `images/reference.${ext}`;
            assetPromises.push(fetchAndAppend(project.reference_image_url, refImagePath));
        }

        for (const scene of project.scenes) {
            const sceneId = `scene_${scene.scene_number.toString().padStart(2, '0')}`;

            // Determine extensions
            let imgExt = 'png';
            if (scene.image_url) {
                imgExt = getExtension(scene.image_url, 'png', ['png', 'jpg', 'jpeg', 'webp']);
            }

            let audioExt = 'mp3';
            if (scene.audio_url) {
                audioExt = getExtension(scene.audio_url, 'mp3', ['mp3', 'wav', 'm4a']);
            }

            // Add to project.json scenes list
            projectJsonScenes.push({
                id: sceneId,
                text: scene.narration,
                prompt: scene.visual_description || `Scene ${scene.scene_number}`,
                duration: scene.duration_seconds,
                audio: scene.audio_url ? `audio/${sceneId}.${audioExt}` : null,
                image: scene.image_url ? `images/${sceneId}.${imgExt}` : null,
                video: scene.video_url || null
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
            id: project.id,
            projectName: project.generated_title || project.topic || "Untitled Project",
            topic: project.topic,
            style: project.style,
            settings: {
                language: project.language,
                voiceName: project.voice_name,
                ttsProvider: project.tts_provider,
                videoModel: project.video_model,
                audioModel: project.audio_model,
                includeMusic: project.include_music
            },
            backgroundMusic: bgMusicPath,
            referenceImage: refImagePath,
            scenes: projectJsonScenes,
            metadata: {
                exportedAt: new Date().toISOString(),
                version: "1.0"
            }
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
