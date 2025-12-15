/**
 * JSON Normalizer - Sistema flexível de normalização de formatos diversos de personas
 * 
 * Suporta múltiplos formatos de saída, detectando automaticamente a estrutura
 * e convertendo para o formato padrão interno do sistema.
 */

export interface NormalizedScript {
    videoTitle: string;
    videoDescription: string;
    shortsHashtags: string[];
    tiktokText: string;
    tiktokHashtags: string[];
    scenes: NormalizedScene[];
    metadata?: any; // Metadados originais preservados
}

export interface NormalizedScene {
    sceneNumber: number;
    visualDescription: string;
    narration: string;
    durationSeconds: number;
}

/**
 * Detecta automaticamente o formato do JSON e normaliza para estrutura padrão
 */
export function normalizeScriptFormat(json: any, fallbackTopic: string = "Untitled"): NormalizedScript {
    console.log('[JsonNormalizer] Detecting format...', Object.keys(json));

    // Formato 1: Padrão do Sistema (videoTitle, scenes)
    if (json.videoTitle || (json.scenes && !json.id_do_roteiro && !json.cronograma)) {
        console.log('[JsonNormalizer] Format detected: Standard System Format');
        return normalizeStandardFormat(json, fallbackTopic);
    }

    // Formato 2: Arquivo Éden v15 - Roteiro Único (id_do_roteiro, meta, hook_killer, scenes)
    if (json.id_do_roteiro || (json.meta && json.hook_killer)) {
        console.log('[JsonNormalizer] Format detected: Arquivo Éden v15 (Single Script)');
        return normalizeEdenSingleFormat(json, fallbackTopic);
    }

    // Formato 3: Estrutura aninhada genérica (raiz única com meta/scenes)
    const keys = Object.keys(json);
    if (keys.length === 1 && typeof json[keys[0]] === 'object' && json[keys[0]].scenes) {
        console.log('[JsonNormalizer] Format detected: Nested Generic Format');
        return normalizeNestedFormat(json, keys[0], fallbackTopic);
    }

    // Formato 4: Flat com scenes direto
    if (json.scenes && Array.isArray(json.scenes)) {
        console.log('[JsonNormalizer] Format detected: Flat Format with Scenes');
        return normalizeFlatFormat(json, fallbackTopic);
    }

    // Formato desconhecido - tentar salvamento genérico
    console.warn('[JsonNormalizer] Unknown format, attempting generic normalization');
    return normalizeGenericFormat(json, fallbackTopic);
}

/**
 * Normaliza cenas de diversos formatos para o padrão
 */
export function normalizeScenes(scenes: any[]): NormalizedScene[] {
    if (!Array.isArray(scenes)) return [];

    return scenes.map((s: any, i: number) => {
        // Detectar número da cena
        const sceneNumber =
            s.sceneNumber ||
            s.scene_number ||
            s.scene ||
            s.number ||
            (i + 1);

        // Detectar descrição visual
        const visualDescription =
            s.visualDescription ||
            s.visual_description ||
            s.visual ||
            s.imagePrompt ||
            s.image_prompt ||
            s.desc ||
            s.description ||
            "Scene visual";

        // Detectar narração
        const narration =
            s.narration ||
            s.audio ||
            s.text ||
            s.speech ||
            s.voiceover ||
            s.narration_text ||
            "";

        // Detectar duração (segundos)
        let duration =
            s.durationSeconds ||
            s.duration_seconds ||
            s.duration ||
            s.durationSec ||
            5;

        // Se duração ainda é padrão e há narração, calcular baseado em palavras
        if (duration === 5 && narration) {
            const wordCount = narration.split(/\s+/).filter((w: string) => w.length > 0).length;
            if (wordCount > 0) {
                // 3.5 palavras por segundo (padrão de leitura reflexiva)
                duration = Math.ceil(wordCount / 3.5);
                duration = Math.min(duration, 8); // Max 8s para Veo
                duration = Math.max(duration, 3); // Min 3s
            }
        }

        return {
            sceneNumber: Number(sceneNumber),
            visualDescription,
            narration,
            durationSeconds: Number(duration)
        };
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// NORMALIZADORES ESPECÍFICOS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Formato Padrão: { videoTitle, videoDescription, scenes, ... }
 */
function normalizeStandardFormat(json: any, fallbackTopic: string): NormalizedScript {
    return {
        videoTitle: json.videoTitle || json.title || fallbackTopic,
        videoDescription: json.videoDescription || json.description || "",
        shortsHashtags: json.shortsHashtags || json.hashtags || [],
        tiktokText: json.tiktokText || json.tiktok_text || "",
        tiktokHashtags: json.tiktokHashtags || json.tiktok_hashtags || [],
        scenes: normalizeScenes(json.scenes || []),
        metadata: json
    };
}

/**
 * Formato Arquivo Éden v15: { id_do_roteiro: { meta, hook_killer, scenes } }
 * ou { meta, hook_killer, scenes } diretamente
 */
function normalizeEdenSingleFormat(json: any, fallbackTopic: string): NormalizedScript {
    const roteiro = json.id_do_roteiro || json;
    const meta = roteiro.meta || {};
    const hook = roteiro.hook_killer || roteiro.hook_falado || "";

    // Construir descrição combinando hook + mensagem nuclear
    const descriptionParts: string[] = [];
    if (hook) descriptionParts.push(hook);
    if (meta.mensagem_nuclear) descriptionParts.push(meta.mensagem_nuclear);
    if (meta.citacao_chave) descriptionParts.push(`📖 ${meta.citacao_chave}`);

    // Extrair hashtags da citação chave se disponível
    const hashtags: string[] = [];
    if (meta.tema_espiritual) {
        const themeWords = meta.tema_espiritual.toLowerCase().split(/\s+/);
        themeWords.forEach((word: string) => {
            if (word.length > 3) {
                hashtags.push(`#${word.replace(/[^a-z0-9]/g, '')}`);
            }
        });
    }
    hashtags.push('#shorts', '#viral', '#fe');

    return {
        videoTitle: meta.titulo_otimizado || roteiro.titulo || fallbackTopic,
        videoDescription: descriptionParts.join('\n\n'),
        shortsHashtags: Array.from(new Set(hashtags)).slice(0, 15),
        tiktokText: hook || meta.mensagem_nuclear || "",
        tiktokHashtags: ['#fyp', '#viral', '#fe'],
        scenes: normalizeScenes(roteiro.scenes || []),
        metadata: {
            ...meta,
            hook_killer: hook,
            trilha_sonora: meta.trilha_sonora,
            tema_espiritual: meta.tema_espiritual
        }
    };
}

/**
 * Formato Aninhado: { "algum_id": { ...conteúdo } }
 */
function normalizeNestedFormat(json: any, key: string, fallbackTopic: string): NormalizedScript {
    const content = json[key];

    // Tentar detectar se é formato Éden ou padrão
    if (content.meta && content.hook_killer) {
        return normalizeEdenSingleFormat(content, fallbackTopic);
    }

    return normalizeStandardFormat(content, fallbackTopic);
}

/**
 * Formato Flat: { title?, description?, scenes: [...] }
 */
function normalizeFlatFormat(json: any, fallbackTopic: string): NormalizedScript {
    // Tentar extrair metadados de múltiplas fontes
    const title =
        json.title ||
        json.titulo ||
        json.videoTitle ||
        json.video_title ||
        fallbackTopic;

    const description =
        json.description ||
        json.descricao ||
        json.videoDescription ||
        json.intro ||
        json.hook_falado ||
        "";

    // Construir hashtags a partir de campos disponíveis
    const hashtags =
        json.hashtags ||
        json.shortsHashtags ||
        json.tags ||
        ['#shorts', '#viral'];

    return {
        videoTitle: title,
        videoDescription: description,
        shortsHashtags: Array.isArray(hashtags) ? hashtags : [],
        tiktokText: json.tiktokText || json.hook || "",
        tiktokHashtags: json.tiktokHashtags || ['#fyp', '#viral'],
        scenes: normalizeScenes(json.scenes || json.script || []),
        metadata: json
    };
}

/**
 * Formato Genérico (Fallback): Tenta extrair dados de qualquer estrutura
 */
function normalizeGenericFormat(json: any, fallbackTopic: string): NormalizedScript {
    console.warn('[JsonNormalizer] Using generic fallback normalization');

    // Procurar cenas em qualquer lugar
    let scenes: any[] = [];

    // Buscar em profundidade por array de cenas
    function findScenes(obj: any): any[] {
        if (Array.isArray(obj)) {
            // Verificar se parece um array de cenas
            if (obj.length > 0 && obj[0].visual || obj[0].narration || obj[0].visualDescription) {
                return obj;
            }
        }

        if (typeof obj === 'object' && obj !== null) {
            for (const key of Object.keys(obj)) {
                if (key.toLowerCase().includes('scene') || key.toLowerCase().includes('script')) {
                    const result = findScenes(obj[key]);
                    if (result.length > 0) return result;
                }
            }
        }

        return [];
    }

    scenes = json.scenes || json.script || findScenes(json);

    // Procurar título em qualquer campo provável
    const title =
        json.title ||
        json.titulo ||
        json.videoTitle ||
        json.name ||
        fallbackTopic;

    return {
        videoTitle: title,
        videoDescription: json.description || json.descricao || "",
        shortsHashtags: ['#shorts', '#viral'],
        tiktokText: "",
        tiktokHashtags: ['#fyp'],
        scenes: normalizeScenes(scenes),
        metadata: json
    };
}
