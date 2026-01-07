import { RenderScene, RenderOptions, EffectConfig, TextStyle } from './types';
import path from 'path';

/**
 * FFmpeg Filter Builder
 * Builds complex filter chains that replicate all frontend canvas effects
 */

export class FFmpegFilterBuilder {
    private resolution: { width: number; height: number };
    private fps: number;

    constructor(options: RenderOptions) {
        this.resolution = options.resolution === '1080p'
            ? { width: 1080, height: 1920 }
            : { width: 720, height: 1280 };
        this.fps = options.fps;
    }

    /**
     * Build complete filter complex for all scenes
     */
    buildFilterComplex(
        scenes: RenderScene[],
        sceneFiles: { video?: string; image?: string; audio: string; particle?: string }[],
        bgMusicFile?: string,
        endingVideoFile?: string,
        subtitlesFile?: string,
        options?: { bgMusicVolume?: number; narrationVolume?: number }
    ): string {
        const filters: string[] = [];
        const videoStreams: string[] = [];
        let inputIndex = 0;

        // Process each scene
        scenes.forEach((scene, idx) => {
            const files = sceneFiles[idx];
            const sceneFilter = this.buildSceneFilter(scene, files, inputIndex, idx);
            filters.push(sceneFilter.filter);
            videoStreams.push(sceneFilter.output);
            inputIndex = sceneFilter.nextInputIndex;
        });

        // Concatenate all scene videos
        const concatVideo = `[${videoStreams.join('][')}]concat=n=${scenes.length}:v=1:a=0[video_scenes]`;
        filters.push(concatVideo);

        let finalVideo = 'video_scenes';

        // Add ending video if present
        if (endingVideoFile) {
            const endingInput = inputIndex++;
            filters.push(`[${endingInput}:v]scale=${this.resolution.width}:${this.resolution.height}:force_original_aspect_ratio=increase,crop=${this.resolution.width}:${this.resolution.height}[ending_scaled]`);
            filters.push(`[${finalVideo}][ending_scaled]concat=n=2:v=1:a=0[video_with_ending]`);
            finalVideo = 'video_with_ending';
        }

        // Add subtitles if provided
        if (subtitlesFile && options) {
            // Escape path for FFmpeg
            const escapedPath = subtitlesFile.replace(/\\/g, '/').replace(/:/g, '\\:');
            filters.push(`[${finalVideo}]ass='${escapedPath}'[video_final]`);
            finalVideo = 'video_final';
        }

        // Audio mixing
        const audioMix = this.buildAudioMix(scenes.length, bgMusicFile, endingVideoFile, options);
        if (audioMix) {
            filters.push(audioMix);
        }

        return filters.join('; ');
    }

    /**
     * Build filter for a single scene
     */
    private buildSceneFilter(
        scene: RenderScene,
        files: { video?: string; image?: string; particle?: string },
        startInputIndex: number,
        sceneIdx: number
    ): { filter: string; output: string; nextInputIndex: number } {
        const filters: string[] = [];
        let currentStream = `${startInputIndex}:v`;
        let inputIndex = startInputIndex + 1;

        const isVideo = !!files.video;
        const hasParticle = !!files.particle;
        const outputLabel = `scene${sceneIdx}_final`;

        // Step 1: Scale and crop (object-cover behavior)
        const cropX = scene.videoCropConfig?.x ?? 50;
        const scaleCropFilter = isVideo
            ? `[${currentStream}]scale=${this.resolution.width}:${this.resolution.height}:force_original_aspect_ratio=increase,crop=${this.resolution.width}:${this.resolution.height}:x='(in_w-${this.resolution.width})*${cropX / 100}':y='(in_h-${this.resolution.height})/2'[s${sceneIdx}_scaled]`
            : `[${currentStream}]scale=${this.resolution.width}:${this.resolution.height}:force_original_aspect_ratio=increase,crop=${this.resolution.width}:${this.resolution.height}[s${sceneIdx}_scaled]`;

        filters.push(scaleCropFilter);
        currentStream = `s${sceneIdx}_scaled`;

        // Step 2: Pan/Zoom
        if (isVideo && scene.videoDuration && scene.videoDuration < scene.durationSeconds) {
            // Video frozen - gentle zoom (3% per second)
            const frozenDuration = scene.durationSeconds - scene.videoDuration;
            const zoomEnd = 1.0 + (0.03 * frozenDuration);
            filters.push(`[${currentStream}]zoompan=z='min(${zoomEnd},max(zoom,pzoom)+0.003)':d=${this.fps * scene.durationSeconds}:s=${this.resolution.width}x${this.resolution.height}:fps=${this.fps}[s${sceneIdx}_zoom]`);
            currentStream = `s${sceneIdx}_zoom`;
        } else if (!isVideo) {
            // Static image - 15% zoom
            filters.push(`[${currentStream}]zoompan=z='min(1.15,pzoom+0.0015)':d=${this.fps * scene.durationSeconds}:s=${this.resolution.width}x${this.resolution.height}:fps=${this.fps}[s${sceneIdx}_zoom]`);
            currentStream = `s${sceneIdx}_zoom`;
        }

        // Step 3: Gradient overlay (bottom gradient)
        filters.push(`[${currentStream}]drawbox=0:${Math.floor(this.resolution.height * 0.4)}:${this.resolution.width}:${Math.floor(this.resolution.height * 0.6)}:c=black@0.0:t=fill,drawbox=0:${Math.floor(this.resolution.height * 0.7)}:${this.resolution.width}:${Math.floor(this.resolution.height * 0.3)}:c=black@0.6:t=fill,drawbox=0:${Math.floor(this.resolution.height * 0.9)}:${this.resolution.width}:${Math.floor(this.resolution.height * 0.1)}:c=black@0.95:t=fill[s${sceneIdx}_grad]`);
        currentStream = `s${sceneIdx}_grad`;

        // Step 4: Particle overlay
        if (hasParticle) {
            const particleInput = inputIndex++;
            filters.push(`[${particleInput}:v]scale=${this.resolution.width}:${this.resolution.height}:force_original_aspect_ratio=increase,crop=${this.resolution.width}:${this.resolution.height}[particle${sceneIdx}]`);
            filters.push(`[${currentStream}][particle${sceneIdx}]blend=all_mode=screen:all_opacity=0.7[s${sceneIdx}_particle]`);
            currentStream = `s${sceneIdx}_particle`;
        }

        // Step 5: Visual effects
        if (scene.effectConfig) {
            currentStream = this.applyEffects(scene.effectConfig, currentStream, sceneIdx, filters);
        }

        // Step 6: Hook text (first 3 seconds)
        if (scene.hookText && scene.textStyle) {
            currentStream = this.applyHookText(scene.hookText, scene.textStyle, currentStream, sceneIdx, filters);
        }

        // Rename final output
        filters.push(`[${currentStream}]copy[${outputLabel}]`);

        return {
            filter: filters.join(', '),
            output: outputLabel,
            nextInputIndex: inputIndex
        };
    }

    /**
     * Apply visual effects to stream
     */
    private applyEffects(effects: EffectConfig, stream: string, sceneIdx: number, filters: string[]): string {
        let currentStream = stream;

        // Vignette
        if (effects.vignette) {
            const angle = 'PI/4';
            filters.push(`[${currentStream}]vignette=angle=${angle}:eval=frame[s${sceneIdx}_vignette]`);
            currentStream = `s${sceneIdx}_vignette`;
        }

        // Grain
        if (effects.grain) {
            const intensity = Math.floor(effects.grain.intensity * 20);
            filters.push(`[${currentStream}]noise=alls=${intensity}:allf=t+u[s${sceneIdx}_grain]`);
            currentStream = `s${sceneIdx}_grain`;
        }

        // Scanlines
        if (effects.scanlines) {
            const spacing = effects.scanlines.spacing || 2;
            const opacity = effects.scanlines.intensity;
            filters.push(`[${currentStream}]drawbox=y='mod(t*${this.fps},${spacing})':w=iw:h=1:c=black@${opacity}:t=fill[s${sceneIdx}_scan]`);
            currentStream = `s${sceneIdx}_scan`;
        }

        // Sepia
        if (effects.sepia && effects.sepia.intensity > 0) {
            filters.push(`[${currentStream}]colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131[s${sceneIdx}_sepia]`);
            currentStream = `s${sceneIdx}_sepia`;
        }

        return currentStream;
    }

    /**
     * Apply hook text overlay
     */
    private applyHookText(text: string, style: TextStyle, stream: string, sceneIdx: number, filters: string[]): string {
        const fontMap: Record<string, string> = {
            'bebas-neue': '/usr/share/fonts/truetype/bebas-neue/BebasNeue-Regular.ttf',
            'anton': '/usr/share/fonts/truetype/anton/Anton-Regular.ttf',
            'bangers': '/usr/share/fonts/truetype/bangers/Bangers-Regular.ttf',
            'righteous': '/usr/share/fonts/truetype/righteous/Righteous-Regular.ttf'
        };

        const sizeMap = {
            small: Math.floor(this.resolution.width * 0.12),
            medium: Math.floor(this.resolution.width * 0.15),
            large: Math.floor(this.resolution.width * 0.18)
        };

        const font = fontMap[style.font || 'bebas-neue'] || fontMap['bebas-neue'];
        const fontSize = sizeMap[style.size || 'large'];
        const color = (style.color || '#FFD700').replace('#', '0x');

        let yPos = 'h/2';
        if (style.position === 'top') yPos = 'h*0.2';
        else if (style.position === 'bottom') yPos = 'h*0.8';

        // Escape text for FFmpeg
        const escapedText = text.replace(/'/g, "'\\''").replace(/:/g, '\\:');

        filters.push(`[${stream}]drawtext=fontfile='${font}':text='${escapedText}':fontsize=${fontSize}:fontcolor=${color}:x=(w-text_w)/2:y=${yPos}:borderw=${Math.floor(fontSize / 30)}:bordercolor=black:shadowcolor=black@0.9:shadowx=0:shadowy=${Math.floor(fontSize / 20)}:enable='lt(t,3)'[s${sceneIdx}_text]`);

        return `s${sceneIdx}_text`;
    }

    /**
     * Build audio mixing filter
     */
    private buildAudioMix(
        sceneCount: number,
        bgMusicFile?: string,
        endingVideoFile?: string,
        options?: { bgMusicVolume?: number; narrationVolume?: number }
    ): string {
        const narrationVol = options?.narrationVolume ?? 0.7;
        const musicVol = options?.bgMusicVolume ?? 0.18;

        const filters: string[] = [];

        // Concatenate all narration audios
        const narrationInputs = Array.from({ length: sceneCount }, (_, i) => `[${i * 2 + 1}:a]`).join('');
        filters.push(`${narrationInputs}concat=n=${sceneCount}:v=0:a=1[narration]`);

        // Apply narration volume
        filters.push(`[narration]volume=${narrationVol}[nar_vol]`);

        let finalAudio = 'nar_vol';

        // Mix with background music if present
        if (bgMusicFile) {
            const bgMusicInput = sceneCount * 2; // After all scene video+audio pairs
            filters.push(`[${bgMusicInput}:a]aloop=loop=-1:size=2e+09,volume=${musicVol}[bg_vol]`);
            filters.push(`[${finalAudio}][bg_vol]amix=inputs=2:duration=first[audio_final]`);
            finalAudio = 'audio_final';
        } else {
            filters.push(`[${finalAudio}]acopy[audio_final]`);
        }

        return filters.join('; ');
    }
}
