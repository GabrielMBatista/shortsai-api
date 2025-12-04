import { KeyManager } from '../core/key-manager';
import { executeRequest } from '../core/executor';
import { trackUsage } from '../core/usage-tracker';
import { RateLimiter } from '../core/rate-limiter';
import { wait } from '../core/queue';

export const VEO_MODELS = {
    'veo-2': 'veo-2.0-generate-001',           // 50 RPD - Best for high volume
    'veo-3': 'veo-3.0-generate-preview',           // 10 RPD - Higher quality
    'veo-3-fast': 'veo-3.0-fast-generate-preview', // 10 RPD - Faster generation
} as const;

export type VeoModelType = keyof typeof VEO_MODELS;

export class VideoService {
    static async generateVideo(
        userId: string,
        imageUrl: string,
        prompt: string,
        keys?: { gemini?: string },
        modelId: string = 'veo-2.0-generate-001',
        withAudio: boolean = false
    ): Promise<string> {
        const { key: apiKey, isSystem } = await KeyManager.getGeminiKey(userId, keys?.gemini);
        console.log(`[VideoService] Using API Key: ${apiKey.substring(0, 8)}... (System Key: ${isSystem})`);

        // 1. Always check cooldown (40s rule) to prevent 429s
        // This atomically checks AND updates the timestamp if valid
        await RateLimiter.acquireVideoSlot(userId);

        if (isSystem) {
            await RateLimiter.checkVideoRateLimits(userId, modelId);
        }

        const base64Data = imageUrl.split(',')[1];
        const mimeType = imageUrl.match(/data:([^;]+);/)?.[1] || 'image/jpeg';

        let selectedModel = modelId;
        if (selectedModel === 'veo') selectedModel = 'veo-2.0-generate-001';

        // 1. Extract context using Gemini Flash for better animation prompts
        let animationPrompt = "";
        try {
            const { client: ai } = await KeyManager.getGeminiClient(userId, keys?.gemini);

            const result = await ai.models.generateContent({
                model: "gemini-2.0-flash-exp",
                contents: [
                    {
                        role: "user",
                        parts: [
                            {
                                text: `Create a concise (under 40 words) cinematic animation prompt based on this visual description. Focus on movement, camera angle and atmosphere. Output ONLY the prompt: "${prompt}"`
                            }
                        ]
                    }
                ]
            });

            const extractedPrompt = result.candidates?.[0]?.content?.parts?.[0]?.text;
            if (extractedPrompt) {
                console.log(`[VideoService] Extracted animation context: ${extractedPrompt}`);
                animationPrompt = extractedPrompt;
            }
        } catch (e) {
            console.warn("[VideoService] Failed to extract context, falling back to provided prompt", e);
            // Fallback to using the original prompt if extraction fails, but truncated
            animationPrompt = prompt.substring(0, 100);
        }

        return executeRequest(isSystem, async () => {
            console.log(`[AIService] Generating video with ${selectedModel} for user ${userId}`);

            // Use REST API predictLongRunning
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:predictLongRunning`,
                {
                    method: 'POST',
                    headers: {
                        'X-goog-api-key': apiKey,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        instances: [
                            {
                                prompt: `Cinematic slow motion animation of this image. Ambient movement, high quality video background. ${animationPrompt}`,
                                image: {
                                    bytesBase64Encoded: base64Data,
                                    mimeType: mimeType,
                                },
                            },
                        ],
                        parameters: {
                            aspectRatio: '9:16', // Vertical video for shorts
                            negativePrompt: 'abrupt cuts, discontinuity, inconsistent lighting, morphing, distortion',
                        },
                    }),
                }
            );

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[AIService] Veo API Error:`, errorText);
                throw new Error(`Veo API request failed: ${response.status} - ${errorText}`);
            }

            const result = await response.json();

            // The API returns an operation that processes async
            const operationName = result.name;

            if (!operationName) {
                throw new Error('No operation name returned from Veo API');
            }

            // Poll for completion
            const videoUrl = await this.pollVeoOperation(operationName, apiKey);

            // Track usage
            await trackUsage(userId, 'gemini', selectedModel, 'video');

            return videoUrl;
        }, userId);
    }

    private static async pollVeoOperation(operationName: string, apiKey: string): Promise<string> {
        const maxRetries = 60; // 5 minutes max (5 seconds * 60)
        const interval = 5000; // 5 seconds

        for (let i = 0; i < maxRetries; i++) {
            await wait(interval);

            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/${operationName}`,
                {
                    headers: {
                        'X-goog-api-key': apiKey,
                    },
                }
            );

            if (!response.ok) {
                console.warn(`[AIService] Poll attempt ${i + 1} failed`);
                continue;
            }

            const operation = await response.json();

            if (operation.done) {
                // Check for error
                if (operation.error) {
                    throw new Error(`Video generation failed: ${operation.error.message}`);
                }

                // Extract video URI from response
                const videoUri = operation.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;

                if (!videoUri) {
                    console.error('[AIService] No video URI in response:', JSON.stringify(operation.response));
                    throw new Error('No video URL in completed operation');
                }

                // Download the video and convert to base64
                console.log(`[AIService] Downloading video from ${videoUri}`);
                const videoResponse = await fetch(videoUri, {
                    headers: {
                        'X-goog-api-key': apiKey,
                    },
                });

                if (!videoResponse.ok) {
                    throw new Error(`Failed to download video: ${videoResponse.status}`);
                }

                const videoBuffer = await videoResponse.arrayBuffer();
                const base64Video = Buffer.from(videoBuffer).toString('base64');

                return `data:video/mp4;base64,${base64Video}`;
            }
        }

        throw new Error('Video generation timed out after 5 minutes');
    }
}
