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
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
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

            await trackUsage(userId, 'gemini', 'gemini-2.5-flash-image', 'image');

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
                model: "gemini-2.5-flash",
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

            await trackUsage(userId, 'gemini', 'gemini-2.5-flash-vision', 'text');
            return response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "Detailed character face description";
        }, userId);
    }

    static async optimizeReferenceImage(userId: string, base64ImageUrl: string, keys?: { gemini?: string }): Promise<string> {
        const { client: ai, isSystem } = await KeyManager.getGeminiClient(userId, keys?.gemini);
        const base64Data = base64ImageUrl.split(',')[1];
        const prompt = optimizeCharacterPrompt;

        return executeRequest(isSystem, async () => {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
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

            await trackUsage(userId, 'gemini', 'gemini-2.5-flash-image', 'image');

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
