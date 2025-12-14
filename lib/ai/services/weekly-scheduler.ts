
import { prisma } from '@/lib/prisma';
import { KeyManager } from '../core/key-manager';
import { executeRequest } from '../core/executor';
import { trackUsage } from '../core/usage-tracker';

/**
 * WeeklyScheduler
 * Implements a multi-step "Chain of Thought" approach to generate
 * massive weekly schedules without hitting token limits or losing context.
 */
export class WeeklyScheduler {

    /**
     * Orchestrates the generation of a full weekly schedule.
     */
    static async generate(
        userId: string,
        personaId: string,
        message: string,
        channelContext: string = ''
    ): Promise<string> {
        console.log('[WeeklyScheduler] Starting multi-step generation...');

        // 1. Load Persona
        const persona = await prisma.persona.findUnique({ where: { id: personaId } });
        if (!persona) throw new Error('Persona not found');

        const { client: ai, isSystem } = await KeyManager.getGeminiClient(userId);

        // --- STEP 1: THE BLUEPRINT ---
        // Generate only the structure: Themes, Titles, and Hooks. No Scenes.
        console.log('[WeeklyScheduler] Step 1: Generating Blueprint...');
        const blueprintPrompt = `
        CONTEXT:
        ${channelContext}

        TASK:
        You are planning a weekly content schedule for "${message}".
        
        STEP 1 - STRUCTURE ONLY:
        Generate a JSON containing the "meta_global" and the "cronograma" structure.
        For each day (segunda_feira to domingo), define:
        - "tema_dia": The theme of the day.
        - "viral_1", "viral_2", "longo": Objects containing ONLY "titulo" and "hook_falado".
        
        DO NOT generate "scenes" yet. Keep it lightweight.
        Required JSON Structure:
        {
          "id_da_semana": "DD-DD_MMM_YY",
          "meta_global": { ... },
          "cronograma": {
             "segunda_feira": { "tema_dia": "...", "viral_1": { "titulo": "...", "hook_falado": "..." }, ... },
             ...
          }
        }
        `;

        const blueprintJsonStr = await this.callGemini(ai, isSystem, userId, blueprintPrompt, persona.temperature);
        let blueprint;
        try {
            blueprint = JSON.parse(this.cleanJson(blueprintJsonStr));
        } catch (e) {
            console.error('Failed to parse blueprint', e);
            throw new Error('Failed to generate schedule structure.');
        }

        // --- STEP 2: EXPANSION (Batched Parallel Execution) ---
        // To avoid Rate Limits (429) and timeouts, we process in batches of 3.
        console.log('[WeeklyScheduler] Step 2: Expanding Days (Batched)...');

        const days = ['segunda_feira', 'terca_feira', 'quarta_feira', 'quinta_feira', 'sexta_feira', 'sabado', 'domingo'];
        const expandedSchedule: any = {};
        const BATCH_SIZE = 3;

        const expandDay = async (day: string) => {
            if (!blueprint.cronograma[day]) return;

            const dayData = blueprint.cronograma[day];
            console.log(`[WeeklyScheduler] Expanding ${day}...`);

            const expansionPrompt = `
             CONTEXT:
             Project: ${message}
             Week Global Goal: ${blueprint.meta_global?.objetivo || 'N/A'}
             
             FOCUS DAY: ${day.toUpperCase()}
             Theme: ${dayData.tema_dia}
             
             INPUT DATA (Titles & Hooks defined in Step 1):
             ${JSON.stringify(dayData, null, 2)}
 
             TASK:
             Generate the FULL SCRIPTS (scenes, visual, narration, duration) for the 3 videos.
             
             OUTPUT:
             Return ONLY the valid JSON object for this day.
             `;

            // Retry Logic (1 retry)
            let attempts = 0;
            while (attempts < 2) {
                try {
                    const dayResultStr = await this.callGemini(ai, isSystem, userId, expansionPrompt, persona.temperature);
                    const dayResult = JSON.parse(this.cleanJson(dayResultStr));
                    expandedSchedule[day] = dayResult;
                    break; // Success
                } catch (err) {
                    attempts++;
                    console.error(`Failed to expand ${day} (Attempt ${attempts}):`, err);
                    if (attempts >= 2) {
                        expandedSchedule[day] = dayData; // Final Fallback
                    } else {
                        await new Promise(r => setTimeout(r, 1000)); // Wait 1s before retry
                    }
                }
            }
        };

        // Process in batches
        for (let i = 0; i < days.length; i += BATCH_SIZE) {
            const batch = days.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(day => expandDay(day)));
        }

        // --- STEP 3: ASSEMBLY ---
        console.log('[WeeklyScheduler] Step 3: Assembly...');
        const finalOutput = {
            ...blueprint,
            cronograma: expandedSchedule
        };

        return JSON.stringify(finalOutput, null, 2);
    }

    private static async callGemini(ai: any, isSystem: boolean, userId: string, prompt: string, temp: number) {
        return executeRequest(isSystem, async () => {
            const resp = await ai.models.generateContent({
                model: "gemini-2.0-flash-exp",
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: {
                    temperature: temp,
                    maxOutputTokens: 16000, // Enough for 1 day or blueprint
                    responseMimeType: "application/json" // Force JSON mode
                }
            });
            await trackUsage(userId, 'gemini', 'gemini-2.0-flash-exp', 'text');
            return resp.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        }, userId);
    }

    private static cleanJson(str: string): string {
        try {
            // Remove code blocks if present
            let cleaned = str.replace(/```json/g, '').replace(/```/g, '').trim();
            return cleaned;
        } catch (e) {
            return str;
        }
    }
}
