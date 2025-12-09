import { prisma } from '@/lib/prisma';
import { GoogleGenAI } from "@google/genai";

export class KeyManager {
    static async getGeminiKey(userId: string, providedKey?: string): Promise<{ key: string, isSystem: boolean }> {
        if (!userId) {
            throw new Error("userId is required but was undefined. This likely means the payload was not constructed correctly.");
        }

        if (providedKey) return { key: providedKey, isSystem: false };

        const keys = await prisma.apiKey.findUnique({ where: { user_id: userId } });
        const userKey = keys?.gemini_key;

        if (userKey) {
            if (!userKey.startsWith('AIza')) throw new Error("Invalid Gemini API Key format (must start with AIza)");
            return { key: userKey, isSystem: false };
        }

        const systemKey = process.env.GEMINI_API_KEY;
        if (!systemKey) throw new Error("Gemini API Key missing");

        return { key: systemKey, isSystem: true };
    }

    static async getGeminiClient(userId: string, providedKey?: string): Promise<{ client: GoogleGenAI, isSystem: boolean }> {
        const { key, isSystem } = await this.getGeminiKey(userId, providedKey);
        return { client: new GoogleGenAI({ apiKey: key }), isSystem };
    }

    static async getElevenLabsKey(userId: string, providedKey?: string): Promise<{ key: string, isSystem: boolean }> {
        if (!userId) {
            throw new Error("userId is required but was undefined. This likely means the payload was not constructed correctly.");
        }

        if (providedKey) return { key: providedKey, isSystem: false };

        const keys = await prisma.apiKey.findUnique({ where: { user_id: userId } });
        const userKey = keys?.elevenlabs_key;

        if (userKey) return { key: userKey, isSystem: false };

        const systemKey = process.env.ELEVENLABS_API_KEY;
        if (!systemKey) throw new Error("ElevenLabs API Key missing");

        return { key: systemKey, isSystem: true };
    }

    static async getGroqKey(userId: string, providedKey?: string): Promise<{ key: string, isSystem: boolean }> {
        if (!userId) {
            throw new Error("userId is required but was undefined. This likely means the payload was not constructed correctly.");
        }

        if (providedKey) return { key: providedKey, isSystem: false };

        const keys = await prisma.apiKey.findUnique({ where: { user_id: userId } });
        const userKey = keys?.groq_key;

        if (userKey) return { key: userKey, isSystem: false };

        const systemKey = process.env.GROQ_API_KEY;
        if (!systemKey) throw new Error("Groq API Key missing");

        return { key: systemKey, isSystem: true };
    }

    static async getSunoKey(userId: string, providedKey?: string): Promise<{ key: string, isSystem: boolean }> {
        if (!userId) {
            throw new Error("userId is required but was undefined. This likely means the payload was not constructed correctly.");
        }

        if (providedKey) return { key: providedKey, isSystem: false };

        const keys = await prisma.apiKey.findUnique({ where: { user_id: userId } });
        const userKey = keys?.suno_key;

        if (userKey) return { key: userKey, isSystem: false };

        const systemKey = process.env.SUNO_API_KEY;
        // Suno might be optional or system only?
        if (!systemKey) throw new Error("Suno API Key missing.");

        return { key: systemKey, isSystem: true };
    }
}
