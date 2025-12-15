
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

        // 2. Calculate next full week (Mon-Sun)
        const now = new Date();
        const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday
        const daysUntilMonday = dayOfWeek === 0 ? 1 : dayOfWeek === 1 ? 0 : 8 - dayOfWeek;

        const monday = new Date(now);
        monday.setDate(now.getDate() + daysUntilMonday);
        monday.setHours(0, 0, 0, 0);

        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);

        const monthNames = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN',
            'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
        const weekId = `${monday.getDate()}-${sunday.getDate()}_${monthNames[monday.getMonth()]}_${monday.getFullYear().toString().slice(-2)}`;

        console.log(`[WeeklyScheduler] Generating for week: ${weekId}`);

        // 3. Build prompt using persona's system instructions
        const personaInstructions = persona.systemInstruction || '';

        const fullPrompt = `
${personaInstructions}

═══════════════════════════════════════════════════════
CONTEXTO DO CANAL:
${channelContext}

REQUISIÇÃO DO USUÁRIO:
${message}

═══════════════════════════════════════════════════════
🎯 TAREFA ESPECÍFICA:

Gerar um cronograma semanal completo de 7 dias (segunda a domingo) seguindo o formato "SEMANA_COMPLETA" definido em FORMATOS_OFICIAIS_DE_RETORNO.

⚠️ VOCÊ DEVE RESPEITAR **TODAS** AS REGRAS DA PERSONA:
- hooks_de_alta_eficacia (primeira cena sempre com hook emocional)
- cta_padrao (última cena sempre com CTA)
- regra_de_tempo_e_densidade (calcular duration baseado em palavras)
- banco_de_cenarios_seguro (usar apenas cenários listados)
- modelo_visual_constante_de_jesus (descrição precisa em toda aparição)
- heuristica_biblica (selecionar versos inteligentemente por tema emocional)

⚠️ CALCULAR DURAÇÃO CORRETA:
- Virais: cada cena 3-5s, total 20-30s
- Longos: cada cena 5-8s, MÍNIMO 70s (adicionar cenas se necessário)
- Usar campo "duration" em CADA cena com valor calculado

⚠️ ESTRUTURA OBRIGATÓRIA POR VÍDEO:
{
  "titulo": "...",
  "hook_falado": "um dos hooks_de_alta_eficacia",
  "scenes": [
    {
      "scene": 1,
      "visual": "descrição do banco_de_cenarios_seguro",
      "narration": "hook emocional curto",
      "duration": 4  ← CALCULAR baseado em palavras (3.5 palavras/seg)
    },
    ... mais cenas seguindo regra_de_tempo_e_densidade,
    {
      "scene": N,
      "visual": "horizonte amplo ou campo aberto",
      "narration": "um dos cta_padrao",
      "duration": 5
    }
  ]
}

⚠️ ID DA SEMANA: ${weekId}

═══════════════════════════════════════════════════════
RETORNE APENAS O JSON NO FORMATO SEMANA_COMPLETA definido na persona.
        `.trim();

        // 3. Generate the full schedule
        console.log('[WeeklyScheduler] Calling Gemini with persona schema...');
        const resultJsonStr = await this.callGemini(ai, isSystem, userId, fullPrompt, persona.temperature);

        // 4. Parse and validate
        let finalJson;
        try {
            const cleanedJson = this.cleanJson(resultJsonStr);
            console.log('[WeeklyScheduler] Raw JSON length:', resultJsonStr.length, 'chars');
            console.log('[WeeklyScheduler] Cleaned JSON length:', cleanedJson.length, 'chars');

            finalJson = JSON.parse(cleanedJson);
            console.log('[WeeklyScheduler] ✅ Schedule generated successfully');
            console.log('[WeeklyScheduler] Days in schedule:', Object.keys(finalJson.cronograma || {}).length);
        } catch (e: any) {
            console.error('[WeeklyScheduler] ❌ Failed to parse generated JSON');
            console.error('[WeeklyScheduler] Parse error:', e.message);
            console.error('[WeeklyScheduler] First 500 chars of response:', resultJsonStr.substring(0, 500));
            console.error('[WeeklyScheduler] Last 500 chars of response:', resultJsonStr.substring(resultJsonStr.length - 500));

            throw new Error(`Failed to generate valid schedule JSON. Parse error: ${e.message}. Check logs for details.`);
        }

        return JSON.stringify(finalJson, null, 2);
    }

    private static async callGemini(ai: any, isSystem: boolean, userId: string, prompt: string, temp: number) {
        return executeRequest(isSystem, async () => {
            const resp = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: {
                    temperature: temp,
                    maxOutputTokens: 32000, // Increased for full week schedule
                    responseMimeType: "application/json" // Force JSON mode
                }
            });
            await trackUsage(userId, 'gemini', 'gemini-2.5-flash', 'text');
            return resp.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        }, userId);
    }

    private static cleanJson(str: string): string {
        try {
            // Remove markdown code blocks
            let cleaned = str.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

            // Remove trailing commas before } or ]
            cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');

            // Remove comments (// and /* */)
            cleaned = cleaned.replace(/\/\/.*$/gm, '');
            cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');

            // Fix common issues with quotes in narration
            // This is a heuristic - replace smart quotes with normal quotes
            cleaned = cleaned.replace(/[""]/g, '"');
            cleaned = cleaned.replace(/['']/g, "'");

            return cleaned.trim();
        } catch (e) {
            console.error('[WeeklyScheduler] Error cleaning JSON:', e);
            return str;
        }
    }
}
