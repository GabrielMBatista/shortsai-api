/**
 * Sanitizador Pré-API (Camada de Segurança)
 * 
 * FILOSOFIA: Alinhado com as diretrizes já definidas em:
 * - video-prompts.ts (linha 3-11)
 * - script-prompts.ts (linha 23-27)
 * 
 * ESCOPO:
 * - Bloqueia apenas termos que causam rejeição IMEDIATA da API
 * - NÃO substitui o refinamento contextual do Gemini
 * - Preserva nuances/atributos de personagens
 * 
 * DIFERENÇA vs Prompts:
 * - Prompts: Instruem o Gemini a CRIAR descrições seguras
 * - Sanitizador: Remove termos críticos ANTES de chegar ao Gemini
 */

/**
 * Baseado em video-prompts.ts (linha 4-9), estes são os termos que SEMPRE causam rejeição:
 * 
 * Das diretrizes:
 * - "NO children or minors" → Bloquear apenas quando são SUJEITOS (preservar "childlike", "youthful")
 * - "NO violence, gore, weapons" → Bloquear termos explícitos
 * - "NO sexual content, nudity" → Bloquear termos explícitos
 * - "REPLACE religious figures" → O Gemini já faz isso via prompt
 */

// Padrões que indicam MENORES como SUJEITOS principais (bloquear)
// Exemplos: "a child playing", "the kid with a ball", "children are running"
const MINOR_AS_SUBJECT = [
    /\b(a|the)\s+(child|kid|baby|toddler|infant)\s+(is|was|playing|running|with|holding)/gi,
    /\b(children|kids|babies|toddlers)\s+(are|were|playing|running)/gi,
    /\byoung\s+(boy|girl)(s?)\s+(is|are|was|were|playing|running|with)/gi,
];

// Termos que SEMPRE são bloqueados (sem contexto)
// Baseado em script-prompts.ts linha 25: "AVOID: Violence, gore, blood, weapons, explicit content"
const ALWAYS_BLOCK: Record<string, string> = {
    // Conteúdo sexual explícito
    'nude': 'figure',
    'naked': 'person',
    'nudity': 'exposure',
    'porn': 'content',
    'sex': 'intimacy',

    // Violência explícita
    'killing': 'defeating',
    'murdered': 'stopped',
    'bleeding': 'injured',
    'stabbing': 'attacking',
    'shooting': 'aiming',

    // Armas (podem ser contextuais, mas melhor substituir)
    'gun': 'weapon',
    'rifle': 'weapon',
    'pistol': 'weapon',
};

/**
 * Sanitiza prompt ANTES de enviar ao Gemini
 * 
 * PRESERVA:
 * ✅ "childlike innocence" (atributo)
 * ✅ "baby-faced features" (característica)
 * ✅ "youthful energy" (descrição)
 * 
 * BLOQUEIA:
 * ❌ "a child playing in the park" (menor como sujeito)
 * ❌ "the kid with a gun" (menor + termo crítico)
 */
export function sanitizePrompt(prompt: string, type: 'image' | 'video' = 'image'): string {
    let sanitized = prompt;
    let changes: string[] = [];

    // 1. Detectar menores como SUJEITOS
    for (const pattern of MINOR_AS_SUBJECT) {
        sanitized = sanitized.replace(pattern, (match) => {
            changes.push(`Removed minor: "${match.trim()}"`);
            // Substituir preservando estrutura gramatical
            return match
                .replace(/\b(child|kid|baby|toddler|infant)\b/gi, 'young adult')
                .replace(/\b(children|kids|babies|toddlers)\b/gi, 'young adults')
                .replace(/\byoung (boy|girl)/gi, 'young adult');
        });
    }

    // 2. Bloquear termos sempre proibidos
    for (const [blocked, safe] of Object.entries(ALWAYS_BLOCK)) {
        const regex = new RegExp(`\\b${blocked}\\b`, 'gi');
        if (regex.test(sanitized)) {
            sanitized = sanitized.replace(regex, safe);
            changes.push(`Blocked: "${blocked}" → "${safe}"`);
        }
    }

    // 3. Limpar espaços
    sanitized = sanitized.replace(/\s+/g, ' ').trim();

    // Log apenas mudanças reais
    if (changes.length > 0) {
        console.log(`[Pre-API Sanitizer] Changes applied: ${changes.join(', ')}`);
    }

    return sanitized;
}

/**
 * Validação mínima
 */
export function validatePrompt(prompt: string): { valid: boolean; reason?: string } {
    if (prompt.trim().length < 5) {
        return { valid: false, reason: 'Prompt muito curto' };
    }
    return { valid: true };
}
