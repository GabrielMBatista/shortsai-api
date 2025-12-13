import { prisma } from '@/lib/prisma';
import { KeyManager } from '../core/key-manager';
import { executeRequest } from '../core/executor';
import { trackUsage } from '../core/usage-tracker';

export class ChatService {
    /**
     * Sends a message to a Persona and gets a response
     */
    static async chatWithPersona(
        userId: string,
        personaId: string,
        message: string,
        history: { role: 'user' | 'model', parts: { text: string }[] }[] = []
    ) {
        // 1. Load Persona
        const persona = await prisma.persona.findUnique({
            where: { id: personaId }
        });

        if (!persona) {
            throw new Error('Persona not found');
        }

        // 2. Check Access (Ownership or Public/System)
        // If needed. For now, we assume if they have the ID, they can chat if it's visible.
        // Assuming system check is done at route level or implied.

        // 3. Get AI Client
        const { client: ai, isSystem } = await KeyManager.getGeminiClient(userId);

        // 4. Construct System Instruction
        const systemInstruction = persona.systemInstruction || 'You are a helpful AI assistant.';

        // 5. Execute Request
        const startTime = Date.now();
        let success = false;
        let error: any = null;

        try {
            const result = await executeRequest(isSystem, async () => {
                const response = await ai.models.generateContent({
                    model: "gemini-2.0-flash-exp",
                    contents: [
                        ...history,
                        { role: 'user', parts: [{ text: message }] }
                    ],
                    config: {
                        systemInstruction,
                        temperature: persona.temperature,
                        topP: persona.topP,
                        topK: persona.topK,
                        maxOutputTokens: persona.maxOutputTokens
                    }
                });

                await trackUsage(userId, 'gemini', 'gemini-2.0-flash-exp', 'text');

                const responseText = response.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!responseText) throw new Error("No response generated");

                return responseText;
            }, userId);

            success = true;
            return result;

        } catch (e) {
            error = e;
            throw e;
        } finally {
            // 6. Usage Tracking
            const duration = Date.now() - startTime;
            try {
                // Log usage
                await prisma.personaUsageLog.create({
                    data: {
                        personaId: persona.id,
                        userId,
                        action: 'chat',
                        success,
                        duration,
                        errorMsg: error?.message,
                        metadata: {
                            messageLength: message.length
                        }
                    }
                });

                // Update Stats
                await prisma.persona.update({
                    where: { id: persona.id },
                    data: {
                        usageCount: { increment: 1 },
                        lastUsedAt: new Date()
                    }
                });
            } catch (trackError) {
                console.error('[ChatService] Failed to track usage:', trackError);
            }
        }
    }
}
