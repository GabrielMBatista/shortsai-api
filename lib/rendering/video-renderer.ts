import { RenderJobInput, RenderProgress, RenderResult, RenderScene } from './types';
import { FFmpegService } from './ffmpeg-service';
import { FFmpegFilterBuilder } from './ffmpeg-builder';
import { SubtitleGenerator } from './subtitle-generator';
import fs from 'fs/promises';
import path from 'path';

/**
 * Video Renderer Service
 * Orchestrates the complete video rendering pipeline using FFmpeg
 */

export class VideoRenderer {
    private jobId: string;
    private workDir: string | null = null;
    private progressCallback?: (progress: RenderProgress) => void;

    constructor(jobId: string, onProgress?: (progress: RenderProgress) => void) {
        this.jobId = jobId;
        this.progressCallback = onProgress;
    }

    /**
     * Main render function
     */
    async render(input: RenderJobInput): Promise<RenderResult> {
        try {
            // Phase 1: Setup
            this.updateProgress('downloading', 0, 'Setting up rendering environment...');

            // Test FFmpeg availability
            const hasFFmpeg = await FFmpegService.testFFmpeg();
            if (!hasFFmpeg) {
                throw new Error('FFmpeg not found. Please install FFmpeg.');
            }

            // Create temp working directory
            this.workDir = await FFmpegService.createTempDir(this.jobId);
            console.log(`[Renderer] Working directory: ${this.workDir}`);

            // Phase 2: Download assets
            this.updateProgress('downloading', 10, 'Downloading assets from R2...');
            const sceneFiles = await this.downloadSceneAssets(input.scenes);

            let bgMusicPath: string | undefined;
            if (input.bgMusicUrl) {
                bgMusicPath = path.join(this.workDir, 'bgmusic.mp3');
                await FFmpegService.downloadFile(input.bgMusicUrl, bgMusicPath);
            }

            let endingVideoPath: string | undefined;
            if (input.endingVideoUrl) {
                endingVideoPath = path.join(this.workDir, 'ending.mp4');
                await FFmpegService.downloadFile(input.endingVideoUrl, endingVideoPath);
            }

            // Phase 3: Generate subtitles
            this.updateProgress('processing', 30, 'Generating subtitles...');
            let subtitlesPath: string | undefined;
            if (input.options.showSubtitles) {
                subtitlesPath = path.join(this.workDir, 'subtitles.ass');
                const assContent = SubtitleGenerator.generate(input.scenes);
                await fs.writeFile(subtitlesPath, assContent, 'utf8');
                console.log('[Renderer] Subtitles generated');
            }

            // Phase 4: Build FFmpeg command
            this.updateProgress('processing', 40, 'Building render pipeline...');
            const filterBuilder = new FFmpegFilterBuilder(input.options);

            const totalDuration = input.scenes.reduce((sum, s) => sum + s.durationSeconds, 0);
            const outputPath = path.join(this.workDir, `output.${input.options.format}`);

            const ffmpegCommand = this.buildFFmpegCommand(
                sceneFiles,
                filterBuilder,
                input.scenes,
                outputPath,
                bgMusicPath,
                endingVideoPath,
                subtitlesPath,
                input.options
            );

            console.log('[Renderer] FFmpeg command:', ffmpegCommand);

            // Phase 5: Execute render
            this.updateProgress('processing', 50, 'Rendering video with FFmpeg...');

            await FFmpegService.executeWithProgress(
                ffmpegCommand,
                totalDuration,
                (percent) => {
                    // Map 50-90% to FFmpeg progress
                    const mappedPercent = 50 + (percent * 0.4);
                    this.updateProgress('processing', mappedPercent, `Rendering... ${Math.floor(percent)}%`);
                }
            );

            // Phase 6: Upload to R2
            this.updateProgress('uploading', 90, 'Uploading final video to R2...');
            const { uploadBufferToR2 } = await import('@/lib/storage');

            const videoBuffer = await fs.readFile(outputPath);
            const mimeType = input.options.format === 'mp4' ? 'video/mp4' : 'video/webm';
            const r2Url = await uploadBufferToR2(videoBuffer, mimeType, 'scenes/videos');

            if (!r2Url) {
                throw new Error('Failed to upload video to R2');
            }

            // Phase 7: Get file stats
            const stats = await fs.stat(outputPath);

            this.updateProgress('complete', 100, 'Render complete!');

            return {
                success: true,
                videoUrl: r2Url,
                duration: totalDuration,
                fileSize: stats.size
            };

        } catch (error: any) {
            console.error('[Renderer] Error:', error);
            return {
                success: false,
                error: error.message
            };
        } finally {
            // Cleanup
            if (this.workDir) {
                await FFmpegService.cleanupTempDir(this.workDir);
            }
        }
    }

    /**
     * Download all scene assets
     */
    private async downloadSceneAssets(scenes: RenderScene[]): Promise<Array<{
        video?: string;
        image?: string;
        audio: string;
        particle?: string;
    }>> {
        const sceneFiles: Array<{ video?: string; image?: string; audio: string; particle?: string }> = [];

        for (let i = 0; i < scenes.length; i++) {
            const scene = scenes[i];
            const files: { video?: string; image?: string; audio: string; particle?: string } = {
                audio: ''
            };

            // Download video or image
            if (scene.videoUrl) {
                files.video = path.join(this.workDir!, `scene${i}_video.mp4`);
                await FFmpegService.downloadFile(scene.videoUrl, files.video);
            } else if (scene.imageUrl) {
                files.image = path.join(this.workDir!, `scene${i}_image.jpg`);
                await FFmpegService.downloadFile(scene.imageUrl, files.image);
            }

            // Download audio
            files.audio = path.join(this.workDir!, `scene${i}_audio.mp3`);
            await FFmpegService.downloadFile(scene.audioUrl, files.audio);

            // Download particle overlay if present
            if (scene.particleOverlay) {
                files.particle = path.join(this.workDir!, `scene${i}_particle.mp4`);
                await FFmpegService.downloadFile(scene.particleOverlay, files.particle);
            }

            sceneFiles.push(files);

            const progress = 10 + (i / scenes.length) * 20;
            this.updateProgress('downloading', progress, `Downloaded scene ${i + 1}/${scenes.length}`);
        }

        return sceneFiles;
    }

    /**
     * Build complete FFmpeg command
     */
    private buildFFmpegCommand(
        sceneFiles: Array<{ video?: string; image?: string; audio: string; particle?: string }>,
        filterBuilder: FFmpegFilterBuilder,
        scenes: RenderScene[],
        outputPath: string,
        bgMusicPath?: string,
        endingVideoPath?: string,
        subtitlesPath?: string,
        options?: any
    ): string {
        const inputs: string[] = [];

        // Add scene inputs (video/image + audio pairs)
        sceneFiles.forEach((files, idx) => {
            if (files.video) {
                inputs.push(`-i "${files.video}"`);
            } else if (files.image) {
                // Loop image for scene duration
                const duration = scenes[idx].durationSeconds;
                inputs.push(`-loop 1 -t ${duration} -i "${files.image}"`);
            }
            inputs.push(`-i "${files.audio}"`);

            // Add particle if exists
            if (files.particle) {
                inputs.push(`-loop 1 -i "${files.particle}"`);
            }
        });

        // Add background music
        if (bgMusicPath) {
            inputs.push(`-i "${bgMusicPath}"`);
        }

        // Add ending video
        if (endingVideoPath) {
            inputs.push(`-i "${endingVideoPath}"`);
        }

        // Build filter complex
        const filterComplex = filterBuilder.buildFilterComplex(
            scenes,
            sceneFiles,
            bgMusicPath,
            endingVideoPath,
            subtitlesPath,
            options
        );

        // Build final command
        const cmd = [
            'ffmpeg',
            ...inputs,
            `-filter_complex "${filterComplex}"`,
            '-map "[video_final]"',
            '-map "[audio_final]"',
            '-c:v libx264',
            '-preset slow',
            '-crf 18',
            '-profile:v high',
            '-level 4.2',
            '-pix_fmt yuv420p',
            `-r ${options.fps || 60}`,
            '-g 120',
            '-bf 2',
            '-c:a aac',
            '-b:a 320k',
            '-movflags +faststart',
            '-y', // Overwrite output
            `"${outputPath}"`
        ].join(' ');

        return cmd;
    }

    /**
     * Update progress
     */
    private updateProgress(phase: RenderProgress['phase'], progress: number, message: string): void {
        if (this.progressCallback) {
            this.progressCallback({ phase, progress, message });
        }
        console.log(`[Renderer] ${phase.toUpperCase()} - ${Math.floor(progress)}% - ${message}`);
    }
}
