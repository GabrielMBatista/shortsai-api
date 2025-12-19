import { PrismaClient, AssetType } from '@prisma/client';
import { GoogleGenerativeAI } from '@google/generative-ai';

const prisma = new PrismaClient();

interface AssetSearchOptions {
    description: string;
    assetType: AssetType;
    channelId?: string;
    excludeRecentlyUsed?: boolean;
    minSimilarity?: number;
}

interface AssetMatch {
    id: string;
    url: string;
    description: string;
    tags: string[];
    category: string | null;
    similarity: number;
    use_count: number;
    quality_score: number;
    duration_seconds?: number | null;
    metadata?: any;
}

interface ReuseStats {
    totalAssets: number;
    totalImages: number;
    totalAudios: number;
    totalVideos: number;
    reuseRate: number;
    costSavings: number;
}

interface CategoryResult {
    category: string;
    tags: string[];
}

export class AssetLibraryService {
    private genAI: GoogleGenerativeAI | null = null;

    constructor() {
        const apiKey = process.env.GEMINI_API_KEY;
        if (apiKey) {
            this.genAI = new GoogleGenerativeAI(apiKey);
        }
    }

    /**
     * PHASE 1: Catalogar todos os assets existentes no banco
     */
    async catalogExistingAssets(): Promise<{
        catalogedImages: number;
        catalogedAudios: number;
        catalogedVideos: number;
        total: number;
    }> {
        let catalogedImages = 0;
        let catalogedAudios = 0;
        let catalogedVideos = 0;

        const scenes = await prisma.scene.findMany({
            where: {
                OR: [
                    { image_url: { not: null } },
                    { audio_url: { not: null } },
                    { video_url: { not: null } },
                ],
            },
            select: {
                id: true,
                project_id: true,
                visual_description: true,
                narration: true,
                image_url: true,
                audio_url: true,
                video_url: true,
                duration_seconds: true,
            },
        });

        for (const scene of scenes) {
            if (scene.image_url) {
                const existing = await prisma.assetIndex.findFirst({
                    where: { url: scene.image_url },
                });

                if (!existing) {
                    const categorization = await this.categorizeAsset(scene.visual_description);

                    await prisma.assetIndex.create({
                        data: {
                            source_scene_id: scene.id,
                            source_project_id: scene.project_id,
                            asset_type: 'IMAGE',
                            url: scene.image_url,
                            description: scene.visual_description,
                            tags: categorization.tags,
                            category: categorization.category,
                            duration_seconds: null,
                        },
                    });
                    catalogedImages++;
                }
            }

            if (scene.audio_url) {
                const existing = await prisma.assetIndex.findFirst({
                    where: { url: scene.audio_url },
                });

                if (!existing) {
                    const categorization = await this.categorizeAsset(scene.narration);

                    await prisma.assetIndex.create({
                        data: {
                            source_scene_id: scene.id,
                            source_project_id: scene.project_id,
                            asset_type: 'AUDIO',
                            url: scene.audio_url,
                            description: scene.narration,
                            tags: categorization.tags,
                            category: categorization.category,
                            duration_seconds: scene.duration_seconds ? parseFloat(scene.duration_seconds.toString()) : null,
                        },
                    });
                    catalogedAudios++;
                }
            }

            if (scene.video_url) {
                const existing = await prisma.assetIndex.findFirst({
                    where: { url: scene.video_url },
                });

                if (!existing) {
                    const categorization = await this.categorizeAsset(scene.visual_description);

                    await prisma.assetIndex.create({
                        data: {
                            source_scene_id: scene.id,
                            source_project_id: scene.project_id,
                            asset_type: 'VIDEO',
                            url: scene.video_url,
                            description: scene.visual_description,
                            tags: categorization.tags,
                            category: categorization.category,
                            duration_seconds: scene.duration_seconds ? parseFloat(scene.duration_seconds.toString()) : null,
                        },
                    });
                    catalogedVideos++;
                }
            }
        }

        return {
            catalogedImages,
            catalogedAudios,
            catalogedVideos,
            total: catalogedImages + catalogedAudios + catalogedVideos,
        };
    }

    private async categorizeAsset(description: string): Promise<CategoryResult> {
        if (!this.genAI) {
            const words = description.toLowerCase().split(/\s+/);
            const tags = words.slice(0, 5);
            return { category: 'outro', tags };
        }

        try {
            const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

            const prompt = `Analise esta descrição de conteúdo religioso e retorne:
1. Categoria: personagem | ambiente | símbolo | ação | outro
2. Tags: máximo 5 palavras-chave relevantes

Descrição: "${description}"

Retorne APENAS JSON válido no formato: { "category": "...", "tags": ["...", "..."] }`;

            const result = await model.generateContent(prompt);
            const text = result.response.text().trim();

            const jsonText = text.replace(/```json\n?|\n?```/g, '').trim();
            const parsed = JSON.parse(jsonText);

            return {
                category: parsed.category || 'outro',
                tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5) : [],
            };
        } catch (error) {
            console.error('Error categorizing asset:', error);
            const words = description.toLowerCase().split(/\s+/);
            const tags = words.filter(w => w.length > 3).slice(0, 5);
            return { category: 'outro', tags };
        }
    }

    async findCompatibleAssets(options: AssetSearchOptions): Promise<AssetMatch[]> {
        const {
            description,
            assetType,
            channelId,
            excludeRecentlyUsed = true,
            minSimilarity = 0.75,
        } = options;

        const keywords = description.toLowerCase().split(/\s+/).filter(w => w.length > 3);

        const assets = await prisma.assetIndex.findMany({
            where: {
                asset_type: assetType,
                ...(excludeRecentlyUsed && channelId
                    ? { last_used_in_channel: { not: channelId } }
                    : {}),
            },
            orderBy: [
                { quality_score: 'desc' },
                { use_count: 'asc' },
            ],
            take: 50,
        });

        const matches: AssetMatch[] = assets
            .map((asset: any) => {
                const similarity = this.calculateSimilarity(
                    description,
                    asset.description,
                    keywords,
                    asset.tags,
                    assetType
                );

                return {
                    id: asset.id,
                    url: asset.url,
                    description: asset.description,
                    tags: asset.tags,
                    category: asset.category,
                    similarity,
                    use_count: asset.use_count,
                    quality_score: asset.quality_score || 1.0,
                    duration_seconds: asset.duration_seconds,
                    metadata: asset.metadata,
                };
            })
            .filter((match: any) => match.similarity >= minSimilarity)
            .sort((a: any, b: any) => b.similarity - a.similarity)
            .slice(0, 5);

        return matches;
    }

    private calculateSimilarity(
        desc1: string,
        desc2: string,
        keywords1: string[],
        tags2: string[],
        assetType: AssetType
    ): number {
        const d1 = desc1.toLowerCase().trim();
        const d2 = desc2.toLowerCase().trim();

        // Para ÁUDIO, o match deve ser quase literal (Proteção de roteiro)
        if (assetType === 'AUDIO') {
            if (d1 === d2) return 1.0;
            // Se as frases forem muito longas, uma pequena diferença de pontuação ainda pode ser 1.0
            const clean1 = d1.replace(/[^\w\s]/gi, '');
            const clean2 = d2.replace(/[^\w\s]/gi, '');
            if (clean1 === clean2) return 0.99;

            // Fallback para Jaccard em áudio é muito baixo para evitar erros
            return 0;
        }

        // Para VÍDEO e IMAGEM, usamos similaridade semântica/palavras-chave
        const words1 = new Set(keywords1);
        const words2 = new Set(tags2.concat(d2.split(/\s+/)));

        let commonWords = 0;
        words1.forEach(word => {
            if (words2.has(word)) commonWords++;
        });

        const totalWords = words1.size;
        if (totalWords === 0) return 0;

        const jaccard = commonWords / totalWords;

        // Boost se a descrição contiver palavras muito específicas das tags
        const categoryBoost = tags2.some(tag => keywords1.includes(tag.toLowerCase())) ? 0.15 : 0;

        return Math.min(jaccard + categoryBoost, 1.0);
    }

    async trackAssetReuse(assetId: string, channelId?: string): Promise<void> {
        await prisma.assetIndex.update({
            where: { id: assetId },
            data: {
                use_count: { increment: 1 },
                last_used_at: new Date(),
                ...(channelId ? { last_used_in_channel: channelId } : {}),
            },
        });
    }

    async getReuseStats(): Promise<ReuseStats> {
        const [totalAssets, assetsByType, avgUseCount] = await Promise.all([
            prisma.assetIndex.count(),
            prisma.assetIndex.groupBy({
                by: ['asset_type'],
                _count: true,
            }),
            prisma.assetIndex.aggregate({
                _avg: { use_count: true },
            }),
        ]);

        const totalImages = assetsByType.find((g: any) => g.asset_type === 'IMAGE')?._count || 0;
        const totalAudios = assetsByType.find((g: any) => g.asset_type === 'AUDIO')?._count || 0;
        const totalVideos = assetsByType.find((g: any) => g.asset_type === 'VIDEO')?._count || 0;

        const avgUse = avgUseCount._avg.use_count || 1;
        const reuseRate = avgUse > 1 ? ((avgUse - 1) / avgUse) : 0;

        const imageCost = 0.04;
        const audioCost = 0.02;
        const videoCost = 0.15;

        const reusedImages = totalImages * (avgUse - 1);
        const reusedAudios = totalAudios * (avgUse - 1);
        const reusedVideos = totalVideos * (avgUse - 1);

        const costSavings =
            (reusedImages * imageCost) +
            (reusedAudios * audioCost) +
            (reusedVideos * videoCost);

        return {
            totalAssets,
            totalImages,
            totalAudios,
            totalVideos,
            reuseRate,
            costSavings,
        };
    }

    async listAssets(options: {
        skip?: number;
        take?: number;
        assetType?: AssetType;
        category?: string;
    }) {
        const { skip = 0, take = 20, assetType, category } = options;

        const [assets, total] = await Promise.all([
            prisma.assetIndex.findMany({
                where: {
                    ...(assetType ? { asset_type: assetType } : {}),
                    ...(category ? { category } : {}),
                },
                orderBy: { created_at: 'desc' },
                skip,
                take,
            }),
            prisma.assetIndex.count({
                where: {
                    ...(assetType ? { asset_type: assetType } : {}),
                    ...(category ? { category } : {}),
                },
            }),
        ]);

        return { assets, total };
    }

    /**
     * Registra um novo asset no índice para reuso futuro
     */
    async registerAsset(data: {
        source_scene_id: string;
        source_project_id: string;
        asset_type: AssetType;
        url: string;
        description: string;
        duration_seconds?: number | null;
        metadata?: any;
    }) {
        try {
            // Verificar se já existe (evitar duplicatas pelo URL)
            const existing = await prisma.assetIndex.findFirst({
                where: { url: data.url }
            });

            if (existing) return existing;

            const categorization = await this.categorizeAsset(data.description);

            return await prisma.assetIndex.create({
                data: {
                    source_scene_id: data.source_scene_id,
                    source_project_id: data.source_project_id,
                    asset_type: data.asset_type,
                    url: data.url,
                    description: data.description,
                    tags: categorization.tags,
                    category: categorization.category,
                    duration_seconds: data.duration_seconds || null,
                    metadata: data.metadata || null,
                    use_count: 1,
                    quality_score: 1.0
                }
            });
        } catch (error) {
            console.error('[AssetLibraryService] Failed to register asset:', error);
            return null;
        }
    }
}

export const assetLibraryService = new AssetLibraryService();
