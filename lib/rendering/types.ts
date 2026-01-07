/**
 * Types for Video Rendering System
 * Backend FFmpeg-based rendering with full feature parity to frontend
 */

export interface RenderJobInput {
    projectId: string;
    userId: string;
    scenes: RenderScene[];
    options: RenderOptions;
    endingVideoUrl?: string;
    bgMusicUrl?: string;
}

export interface RenderScene {
    sceneNumber: number;

    // Visual Assets
    imageUrl?: string;
    videoUrl?: string;
    videoDuration?: number;
    videoCropConfig?: { x: number }; // X position 0-100%

    // Audio
    audioUrl: string;
    durationSeconds: number;
    narration: string;
    wordTimings?: WordTiming[];

    // Effects
    effectConfig?: EffectConfig;

    // Text Overlays
    hookText?: string;
    textStyle?: TextStyle;

    // Particle overlay
    particleOverlay?: string; // URL to particle video
}

export interface WordTiming {
    word: string;
    start: number; // seconds
    end: number;   // seconds
}

export interface EffectConfig {
    vignette?: { strength: number };
    grain?: { intensity: number };
    scanlines?: { intensity: number; spacing: number };
    sepia?: { intensity: number };
    glitch?: { intensity: number; seed: number };
    flash?: { intensity: number }; // Changed from duration to intensity to match frontend
    shake?: { intensity: number };
}

export interface TextStyle {
    font?: string; // Changed to accept any font name
    color?: string; // Hex color
    position?: 'top' | 'center' | 'bottom';
    size?: 'small' | 'medium' | 'large';
}

export interface RenderOptions {
    format: 'mp4' | 'webm';
    resolution: '1080p' | '720p';
    fps: 30 | 60;
    showSubtitles: boolean;
    title?: string;
    bgMusicVolume?: number; // 0-0.5
    narrationVolume?: number; // 0-1
}

export interface RenderProgress {
    phase: 'downloading' | 'processing' | 'uploading' | 'complete';
    progress: number; // 0-100
    message: string;
    currentScene?: number;
    totalScenes?: number;
}

export interface RenderResult {
    success: boolean;
    videoUrl?: string;
    duration?: number;
    fileSize?: number;
    error?: string;
}
