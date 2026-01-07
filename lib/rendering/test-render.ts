/**
 * Test script for backend video rendering
 * Run with: ts-node lib/rendering/test-render.ts
 */

import { VideoRenderer } from './video-renderer';
import { RenderJobInput } from './types';

async function testRender() {
    console.log('🎬 Starting render test...\n');

    // Sample render job (minimal test)
    const testInput: RenderJobInput = {
        projectId: 'test-project-123',
        userId: 'test-user',
        scenes: [
            {
                sceneNumber: 1,
                imageUrl: 'https://example.com/test-image.jpg',
                audioUrl: 'https://example.com/test-audio.mp3',
                durationSeconds: 5,
                narration: 'This is a test scene with some narration text.',
                wordTimings: [
                    { word: 'This', start: 0, end: 0.3 },
                    { word: 'is', start: 0.3, end: 0.5 },
                    { word: 'a', start: 0.5, end: 0.6 },
                    { word: 'test', start: 0.6, end: 1.0 },
                    { word: 'scene', start: 1.0, end: 1.5 },
                    { word: 'with', start: 1.5, end: 1.8 },
                    { word: 'some', start: 1.8, end: 2.1 },
                    { word: 'narration', start: 2.1, end: 2.8 },
                    { word: 'text.', start: 2.8, end: 3.2 }
                ]
            }
        ],
        options: {
            format: 'mp4',
            resolution: '1080p',
            fps: 60,
            showSubtitles: true,
            narrationVolume: 0.7
        }
    };

    const renderer = new VideoRenderer('test-job-123', (progress) => {
        console.log(`[${progress.phase.toUpperCase()}] ${Math.floor(progress.progress)}% - ${progress.message}`);
    });

    const result = await renderer.render(testInput);

    if (result.success) {
        console.log('\n✅ Render successful!');
        console.log(`📹 Video URL: ${result.videoUrl}`);
        console.log(`⏱️  Duration: ${result.duration}s`);
        console.log(`📦 File size: ${(result.fileSize! / 1024 / 1024).toFixed(2)} MB`);
    } else {
        console.error('\n❌ Render failed:', result.error);
    }
}

// Run test
testRender().catch(console.error);
