import { KeyManager } from '../core/key-manager';
import { executeRequest } from '../core/executor';
import { trackUsage } from '../core/usage-tracker';
import { HarmCategory, HarmBlockThreshold } from "@google/genai";


import { generateImagePrompt, analyzeCharacterPrompt, optimizeCharacterPrompt } from '../prompts/image-prompts';

export class ImageService {
    static async generateImage(userId: string, prompt: string, style: string, keys?: { gemini?: string }): Promise<string> {
        const { client: ai, isSystem } = await KeyManager.getGeminiClient(userId, keys?.gemini);

        const fullPrompt = generateImagePrompt(style, prompt);

        return executeRequest(isSystem, async () => {
            // Check if using new Imagen 4 model which requires REST :predict endpoint
            const isV4 = true; // Force try V4 logic for now as requested
            const modelName = 'imagen-4.0-fast-generate';

            if (isV4) {
                const { key } = await KeyManager.getGeminiKey(userId, keys?.gemini);
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:predict?key=${key}`;

                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        instances: [{ prompt: fullPrompt }],
                        parameters: { aspectRatio: "9:16", sampleCount: 1 }
                    })
                });

                if (!response.ok) {
                    const err = await response.json().catch(() => ({ error: { message: response.statusText } }));
                    // If 404 on V4, throw to fallback? Or just fail. Let's fail with clear message.
                    throw new Error(`Imagen 4 Error (${response.status}): ${JSON.stringify(err)}`);
                }

                const data = await response.json();
                const base64 = data.predictions?.[0]?.bytesBase64Encoded;

                if (base64) {
                    await trackUsage(userId, 'gemini', modelName, 'image');
                    const base64Image = `data:image/png;base64,${base64}`;
                    return await ImageService.uploadToR2(base64Image, 'scenes/images');
                }
                throw new Error("No image returned from Imagen 4");
            }

            // Fallback to SDK for other models
            const response = await ai.models.generateContent({
                model: 'imagen-3.0-generate-001',
                contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
                config: {
                    imageConfig: { aspectRatio: "9:16" },
                    safetySettings: [
                        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
                        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
                        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
                        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH }
                    ]
                }
            });

            await trackUsage(userId, 'gemini', 'imagen-3.0-generate-001', 'image');

            const candidate = response.candidates?.[0];
            if (candidate?.content?.parts) {
                for (const part of candidate.content.parts) {
                    if (part.inlineData?.data) {
                        const base64Image = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
                        return await ImageService.uploadToR2(base64Image, 'scenes/images');
                    }
                }
                const textPart = candidate.content.parts.find(p => p.text);
                if (textPart?.text) {
                    throw new Error(`Model Refusal: ${textPart.text}`);
                }
            }
            throw new Error("Image generation failed - No image returned");
        }, userId);
    }

    static async analyzeCharacterFeatures(userId: string, base64Image: string, keys?: { gemini?: string }): Promise<string> {
        const { client: ai, isSystem } = await KeyManager.getGeminiClient(userId, keys?.gemini);
        const base64Data = base64Image.split(',')[1];
        const prompt = analyzeCharacterPrompt;

        return executeRequest(isSystem, async () => {
            const response = await ai.models.generateContent({
                model: "gemini-2.5-pro",
                contents: [
                    {
                        role: 'user',
                        parts: [
                            { inlineData: { mimeType: "image/png", data: base64Data } },
                            { text: prompt }
                        ]
                    }
                ]
            });

            await trackUsage(userId, 'gemini', 'gemini-2.5-pro', 'text');
            return response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "Detailed character face description";
        }, userId);
    }

    static async optimizeReferenceImage(userId: string, base64ImageUrl: string, keys?: { gemini?: string }): Promise<string> {
        const { client: ai, isSystem } = await KeyManager.getGeminiClient(userId, keys?.gemini);
        // Check if using new Imagen 4 model which requires REST :predict endpoint
        const isV4 = true;
        const modelName = 'imagen-4.0-generate';

        if (isV4) {
            const { key } = await KeyManager.getGeminiKey(userId, keys?.gemini);
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:predict?key=${key}`;
            const base64Data = base64ImageUrl.split(',')[1];

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instances: [{
                        prompt: optimizeCharacterPrompt,
                        image: { bytesBase64Encoded: base64Data } // Vertex AI format often uses struct
                    }],
                    parameters: { aspectRatio: "1:1", sampleCount: 1 }
                })
            });

            if (!response.ok) {
                // Only fail silently or log? Let's throw to see errors
                const err = await response.json().catch(() => ({ error: { message: response.statusText } }));
                throw new Error(`Imagen 4 Opt Error (${response.status}): ${JSON.stringify(err)}`);
            }

            const data = await response.json();
            const base64 = data.predictions?.[0]?.bytesBase64Encoded;

            if (base64) {
                await trackUsage(userId, 'gemini', modelName, 'image');
                const base64Image = `data:image/png;base64,${base64}`;
                return await ImageService.uploadToR2(base64Image, 'characters');
            }
        }

        const base64Data = base64ImageUrl.split(',')[1];
        const prompt = optimizeCharacterPrompt;

        return executeRequest(isSystem, async () => {
            const response = await ai.models.generateContent({
                model: 'imagen-3.0-generate-001', // Reverting to stable Imagen 3
                contents: [
                    {
                        role: 'user',
                        parts: [
                            { inlineData: { mimeType: "image/png", data: base64Data } },
                            { text: prompt }
                        ]
                    }
                ],
                config: {
                    imageConfig: { aspectRatio: "1:1" },
                    safetySettings: [
                        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
                        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
                        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
                        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH }
                    ]
                }
            });

            await trackUsage(userId, 'gemini', 'imagen-3.0-generate-001', 'image');

            const candidate = response.candidates?.[0];
            if (candidate?.content?.parts) {
                for (const part of candidate.content.parts) {
                    if (part.inlineData?.data) {
                        const base64Image = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
                        return await ImageService.uploadToR2(base64Image, 'characters');
                    }
                }
            }
            throw new Error("Optimization failed - No image returned");
        }, userId);
    }

    private static async uploadToR2(base64Data: string, folder: 'scenes/images' | 'characters'): Promise<string> {
        try {
            const { uploadBase64ToR2 } = await import('@/lib/storage');
            const url = await uploadBase64ToR2(base64Data, folder);
            return url || base64Data;
        } catch (e) {
            console.error("Failed to upload to R2, returning Base64", e);
            return base64Data;
        }
    }
}
