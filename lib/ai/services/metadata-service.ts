import { KeyManager } from '../core/key-manager';
import { executeRequest } from '../core/executor';
import { trackUsage } from '../core/usage-tracker';
import { prisma } from '@/lib/prisma';

/**
 * MetadataService
 * Generates optimized metadata (title, description, hashtags) for videos
 * based on channel performance analysis and content optimization
 */
export class MetadataService {
    /**
     * Generate optimized metadata for a video
     * @param userId - User ID
     * @param videoTitle - Video title from persona/script
     * @param videoContent - Video content (hook + scenes narration)
     * @param channelId - Optional channel ID for performance analysis
     * @param language - Content language
     */
    static async generateOptimizedMetadata(
        userId: string,
        videoTitle: string,
        videoContent: string,
        channelId?: string,
        language: string = 'pt-BR'
    ): Promise<{
        optimizedTitle: string;
        optimizedDescription: string;
        shortsHashtags: string[];
        tiktokText: string;
        tiktokHashtags: string[];
    }> {
        const { client: ai, isSystem } = await KeyManager.getGeminiClient(userId);

        // 1. Fetch channel performance data if available
        let channelContext = '';
        if (channelId) {
            try {
                const { ChannelService } = await import('../../../lib/channels/channel-service');

                const [recentProjects, youtubeVideos] = await Promise.all([
                    // Projects created on platform for this channel
                    prisma.project.findMany({
                        where: {
                            channel_id: channelId,
                            status: 'completed'
                        },
                        orderBy: { created_at: 'desc' },
                        take: 10,
                        select: {
                            generated_title: true,
                            generated_shorts_hashtags: true,
                            topic: true
                        }
                    }),

                    // YouTube videos for real channel context
                    ChannelService.getChannelVideos(channelId, {
                        maxResults: 50
                    }).catch(err => {
                        console.warn('[MetadataService] Failed to fetch YouTube videos:', err.message);
                        return [];
                    })
                ]);

                // Build performance-based context
                const topVideos = youtubeVideos
                    .sort((a: any, b: any) => b.statistics.viewCount - a.statistics.viewCount)
                    .slice(0, 15);

                if (topVideos.length > 0) {
                    const formatViews = (views: number): string => {
                        if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M`;
                        if (views >= 1_000) return `${(views / 1_000).toFixed(1)}K`;
                        return views.toString();
                    };

                    channelContext = `
═══════════════════════════════════════
📊 ANÁLISE DE PERFORMANCE DO CANAL
═══════════════════════════════════════

TOP VÍDEOS POR VISUALIZAÇÕES:
${topVideos.slice(0, 10).map((v: any, i: number) =>
                        `${i + 1}. "${v.title}" - ${formatViews(v.statistics.viewCount)} views`
                    ).join('\n')}

INSIGHTS DE TÍTULOS:
- Analise os títulos de melhor performance
- Identifique padrões de linguagem que funcionam
- Use estruturas similares mas não copie diretamente

INSIGHTS DE HASHTAGS:
- Observe quais temas geram mais engajamento
- Balance hashtags genéricas (#shorts) com específicas (#tema)
═══════════════════════════════════════
`;
                }
            } catch (error) {
                console.warn('[MetadataService] Failed to fetch channel context:', error);
            }
        }

        // 2. Build optimization prompt
        const prompt = `${channelContext}

TAREFA: Otimizar metadados para publicação em plataformas de vídeo curto.

CONTEÚDO DO VÍDEO:
Título Base: ${videoTitle}
Conteúdo: ${videoContent.substring(0, 500)}

IDIOMA: ${language}

═══════════════════════════════════════
REQUISITOS DE OTIMIZAÇÃO:
═══════════════════════════════════════

1. TÍTULO OTIMIZADO (max 60 caracteres):
   - Estrutura: [Gatilho Emocional] + [Afirmação Forte] + [Âncora do Tema]
   - Deve incluir palavra-chave principal
   - NUNCA use hashtags no título (serão removidas)
   - Exemplo: "Isso Mudou Tudo! A Verdade Sobre..."

2. DESCRIÇÃO (3-5 linhas):
   Estrutura obrigatória:
   - Linha 1: Hook emocional que gera curiosidade
   - Linhas 2-3: Essência do conteúdo sem spoilers
   - Linha 4: CTA específico (ex: "Comente 'AMÉM' se tocou seu coração")
   - Linha 5: Hashtags (serão fornecidas separadamente, NÃO inclua aqui)

3. SHORTS HASHTAGS (array, min 8, max 12):
   Mix estratégico:
   - 3 genéricas: #shorts, #viral, #fyp
   - 5-6 específicas do tema
   - 2-3 de nicho/comunidade
   Formato: TODAS devem começar com #, lowercase

4. TIKTOK TEXT (1 frase curta):
   - Foco em emoção ou identificação imediata
   - SEM hashtags (serão separadas)
   - SEM links ou menções externas
   - Exemplo: "Isso mudou minha perspectiva para sempre 🤯"

5. TIKTOK HASHTAGS (array, exatamente 5):
   - 1 broad (#fyp ou #foryou)
   - 3 específicas
   - 1 comunidade/nicho
   Formato: todas com #, lowercase

═══════════════════════════════════════
RETORNE APENAS JSON NO FORMATO:
{
  "optimizedTitle": "título sem hashtags",
  "optimizedDescription": "descrição sem hashtags",
  "shortsHashtags": ["#tag1", "#tag2", ...],
  "tiktokText": "texto curto",
  "tiktokHashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"]
}
`;

        // 3. Generate optimized metadata
        const result = await executeRequest(isSystem, async () => {
            const response = await ai.models.generateContent({
                model: "gemini-1.5-flash",
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: {
                    responseMimeType: "application/json",
                    temperature: 0.8,
                    maxOutputTokens: 2048
                }
            });

            await trackUsage(userId, 'gemini', 'gemini-1.5-flash', 'text');

            const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) throw new Error("No metadata generated");

            try {
                const cleanText = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
                const json = JSON.parse(cleanText);

                // Validate and sanitize
                return {
                    optimizedTitle: (json.optimizedTitle || videoTitle).replace(/#\w+/g, '').trim(),
                    optimizedDescription: json.optimizedDescription || '',
                    shortsHashtags: Array.isArray(json.shortsHashtags)
                        ? json.shortsHashtags.map((t: string) => t.startsWith('#') ? t : `#${t}`)
                        : ['#shorts', '#viral', '#fyp'],
                    tiktokText: json.tiktokText || '',
                    tiktokHashtags: Array.isArray(json.tiktokHashtags)
                        ? json.tiktokHashtags.slice(0, 5).map((t: string) => t.startsWith('#') ? t : `#${t}`)
                        : ['#fyp', '#viral', '#foryou', '#trending', '#explore']
                };
            } catch (e) {
                console.error("[MetadataService] JSON Parse Error", text);
                throw new Error("Failed to parse metadata format.");
            }
        }, userId);

        return result;
    }

    /**
     * Generate metadata for batch videos (used in weekly schedules)
     * Optimized for speed by batching multiple videos in one request
     */
    static async generateBatchMetadata(
        userId: string,
        videos: Array<{ title: string; content: string }>,
        channelId?: string,
        language: string = 'pt-BR'
    ): Promise<Array<{
        optimizedTitle: string;
        optimizedDescription: string;
        shortsHashtags: string[];
        tiktokText: string;
        tiktokHashtags: string[];
    }>> {
        // For batch, generate individually but could be optimized with parallel requests
        // or a batch-optimized prompt in the future
        const results = await Promise.all(
            videos.map(v =>
                this.generateOptimizedMetadata(userId, v.title, v.content, channelId, language)
                    .catch(err => {
                        console.error('[MetadataService] Failed to generate metadata for:', v.title, err);
                        // Fallback to basic metadata
                        return {
                            optimizedTitle: v.title,
                            optimizedDescription: v.content.substring(0, 200) + '\n\n💬 Comente e compartilhe!',
                            shortsHashtags: ['#shorts', '#viral', '#fyp'],
                            tiktokText: v.content.substring(0, 100),
                            tiktokHashtags: ['#fyp', '#viral', '#foryou', '#trending', '#explore']
                        };
                    })
            )
        );

        return results;
    }
}
