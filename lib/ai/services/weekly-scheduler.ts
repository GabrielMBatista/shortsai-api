
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

        // 3.5. Detectar e reforçar elementos visuais da persona
        let visualRules = '';
        if (personaInstructions) {
            const hasCharacterDescriptions =
                personaInstructions.includes('JESUS:') ||
                personaInstructions.includes('character:') ||
                personaInstructions.includes('modelo_visual_constante');

            const hasSceneBank =
                personaInstructions.includes('banco_de_cenarios') ||
                personaInstructions.includes('CENÁRIOS') ||
                personaInstructions.includes('SCENARIOS');

            const hasHooks =
                personaInstructions.includes('hooks_de_alta_eficacia') ||
                personaInstructions.includes('HOOKS') ||
                personaInstructions.includes('Hook');

            const hasCTA =
                personaInstructions.includes('cta_padrao') ||
                personaInstructions.includes('CTA') ||
                personaInstructions.includes('call-to-action');

            const hasVisualStyle =
                personaInstructions.includes('ESTILO VISUAL') ||
                personaInstructions.includes('RESTRIÇÕES TÉCNICAS') ||
                personaInstructions.includes('visualStyle');

            // Construir lista dinâmica de regras detectadas
            const detectedRules = [];
            if (hasHooks) detectedRules.push('- Hooks/ganchos iniciais definidos na persona');
            if (hasCTA) detectedRules.push('- CTAs (call-to-action) finais definidos na persona');
            if (hasSceneBank) detectedRules.push('- Banco de cenários/scenarios específicos (usar APENAS os listados)');
            if (hasCharacterDescriptions) detectedRules.push('- Descrições de personagens/characters (manter EXATAMENTE como definido em TODA aparição)');
            if (hasVisualStyle) detectedRules.push('- Restrições técnicas e estilo visual específico');

            if (detectedRules.length > 0) {
                visualRules = `\n⚠️ REGRAS VISUAIS E NARRATIVAS DA PERSONA DETECTADAS:\n${detectedRules.join('\n')}\n`;
            }
        }

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
${visualRules}
⚠️ CALCULAR DURAÇÃO CORRETA:
- Virais: cada cena 3-5s, total 20-30s
- Longos: cada cena 5-8s, MÍNIMO 70s (adicionar cenas se necessário)
- Usar campo "duration" em CADA cena com valor calculado

⚠️ ESTRUTURA OBRIGATÓRIA POR VÍDEO:
{
  "titulo": "...",
  "hook_falado": "hook inicial conforme persona",
  "scenes": [
    {
      "scene": 1,
      "visual": "descrição visual seguindo as regras da persona",
      "narration": "hook emocional curto",
      "duration": 4  ← CALCULAR baseado em palavras (3.5 palavras/seg)
    },
    ... mais cenas seguindo as regras narrativas,
    {
      "scene": N,
      "visual": "cena final conforme persona",
      "narration": "CTA conforme definido na persona",
      "duration": 5
    }
  ]
}

⚠️ CRITICAL: As instruções visuais da persona (descrições de personagens, cenários, estilo) têm PRIORIDADE MÁXIMA.

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
