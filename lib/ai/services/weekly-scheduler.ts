
import { prisma } from '@/lib/prisma';
import { KeyManager } from '../core/key-manager';
import { executeRequest } from '../core/executor';
import { trackUsage } from '../core/usage-tracker';

/**
 * WeeklyScheduler
 * Generates weekly content schedules using the persona's system instructions
 * which contain the exact JSON schema and all generation rules.
 */
export class WeeklyScheduler {

    /**
     * Generates a full weekly schedule using the persona's defined schema
     */
    static async generate(
        userId: string,
        personaId: string,
        message: string,
        channelContext: string = ''
    ): Promise<string> {
        console.log('[WeeklyScheduler] Starting schedule generation...');

        // 1. Load Persona (contains the schema and rules)
        const persona = await prisma.persona.findUnique({ where: { id: personaId } });
        if (!persona) throw new Error('Persona not found');

        const { client: ai, isSystem } = await KeyManager.getGeminiClient(userId);

        // 2. Build prompt using persona's system instructions
        const personaInstructions = persona.systemInstruction || '';

        const fullPrompt = `
${personaInstructions}

CONTEXTO DO CANAL:
${channelContext}

REQUISIÇÃO DO USUÁRIO:
${message}

INSTRUÇÃO CRÍTICA:
Você DEVE retornar APENAS um JSON válido seguindo EXATAMENTE o schema "SEMANA_COMPLETA" definido em suas instruções (FORMATOS_OFICIAIS_DE_RETORNO.SEMANA_COMPLETA).

ESTRUTURA OBRIGATÓRIA (todos os dias IDENTICAMENTE):
{
  "id_da_semana": "DD-DD_MMM_YY",
  "meta_global": { "objetivo": "...", "regra_visual_critica": "...", "ajuste_tecnico": "..." },
  "cronograma": {
    "segunda_feira": {
      "tema_dia": "...",
      "viral_1": { "titulo": "...", "hook_falado": "...", "scenes": [...] },
      "viral_2": { "titulo": "...", "hook_falado": "...", "scenes": [...] },
      "longo": { "titulo": "...", "hook_falado": "...", "scenes": [...] }
    },
    "terca_feira": { MESMA ESTRUTURA },
    "quarta_feira": { MESMA ESTRUTURA },
    "quinta_feira": { MESMA ESTRUTURA },
    "sexta_feira": { MESMA ESTRUTURA },
    "sabado": { MESMA ESTRUTURA },
    "domingo": { MESMA ESTRUTURA }
  }
}

REGRAS OBRIGATÓRIAS:
- TODOS os 7 dias devem seguir EXATAMENTE a mesma estrutura
- Cada dia tem exatamente: tema_dia, viral_1, viral_2, longo
- Nunca use arrays diretos ou estruturas aninhadas diferentes
- Retorne APENAS o JSON, sem texto adicional
        `.trim();

        // 3. Generate the full schedule
        console.log('[WeeklyScheduler] Calling Gemini with persona schema...');
        const resultJsonStr = await this.callGemini(ai, isSystem, userId, fullPrompt, persona.temperature);

        // 4. Parse and validate
        let finalJson;
        try {
            finalJson = JSON.parse(this.cleanJson(resultJsonStr));
            console.log('[WeeklyScheduler] ✅ Schedule generated successfully');
        } catch (e) {
            console.error('[WeeklyScheduler] ❌ Failed to parse generated JSON', e);
            throw new Error('Failed to generate valid schedule JSON.');
        }

        return JSON.stringify(finalJson, null, 2);
    }

    private static async callGemini(ai: any, isSystem: boolean, userId: string, prompt: string, temp: number) {
        return executeRequest(isSystem, async () => {
            const resp = await ai.models.generateContent({
                model: "gemini-2.0-flash-exp",
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: {
                    temperature: temp,
                    maxOutputTokens: 16000,
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
