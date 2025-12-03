import { ScriptService } from './services/script-service';
import { ImageService } from './services/image-service';
import { VideoService, VEO_MODELS, VeoModelType } from './services/video-service';
import { AudioService } from './services/audio-service';
import { MusicService } from './services/music-service';

export { VEO_MODELS, type VeoModelType };

export class AIService {
    static async generateScript(
        userId: string,
        topic: string,
        style: string,
        language: string,
        durationConfig: { min: number, max: number, targetScenes?: number },
        keys?: { gemini?: string }
    ) {
        return ScriptService.generateScript(userId, topic, style, language, durationConfig, keys);
    }

    static async generateImage(userId: string, prompt: string, style: string, keys?: { gemini?: string }) {
        return ImageService.generateImage(userId, prompt, style, keys);
    }

    static async analyzeCharacterFeatures(userId: string, base64Image: string, keys?: { gemini?: string }) {
        return ImageService.analyzeCharacterFeatures(userId, base64Image, keys);
    }

    static async optimizeReferenceImage(userId: string, base64ImageUrl: string, keys?: { gemini?: string }) {
        return ImageService.optimizeReferenceImage(userId, base64ImageUrl, keys);
    }

    static async generateVideo(
        userId: string,
        imageUrl: string,
        prompt: string,
        keys?: { gemini?: string },
        modelId: string = 'veo-2.0-generate-001',
        withAudio: boolean = false
    ) {
        return VideoService.generateVideo(userId, imageUrl, prompt, keys, modelId, withAudio);
    }

    static async generateAudio(userId: string, text: string, voice: string, provider: string, keys?: { gemini?: string, elevenlabs?: string, groq?: string }, modelId?: string) {
        return AudioService.generateAudio(userId, text, voice, provider, keys, modelId);
    }

    static async getElevenLabsVoices(userId: string, providedKey?: string) {
        return AudioService.getElevenLabsVoices(userId, providedKey);
    }

    static async generateMusicPrompt(userId: string, topic: string, style: string, keys?: { gemini?: string }) {
        return MusicService.generateMusicPrompt(userId, topic, style, keys);
    }

    static async generateMusic(userId: string, stylePrompt: string, keys?: { suno?: string }) {
        return MusicService.generateMusic(userId, stylePrompt, keys);
    }
}
