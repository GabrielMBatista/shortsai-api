import { prisma } from '@/lib/prisma';
import { parseYouTubeCSV, ParsedMetric } from './csv-parser';

/**
 * Import metrics from CSV file
 */
export async function importMetricsFromCSV(
    channelId: string,
    userId: string,
    filename: string,
    fileContent: string
) {
    // Parse CSV
    const parseResult = parseYouTubeCSV(fileContent);

    if (!parseResult.success && parseResult.data.length === 0) {
        throw new Error(
            `CSV parsing failed: ${parseResult.errors.map((e) => e.error).join(', ')}`
        );
    }

    // Create import batch
    const batch = await prisma.youtubeImportBatch.create({
        data: {
            channelId,
            filename,
            totalRows: parseResult.stats.totalRows,
            importedRows: 0,
            skippedRows: 0,
            importedBy: userId,
            errors: parseResult.errors.length > 0 ? JSON.parse(JSON.stringify(parseResult.errors)) : null,
        },
    });

    let importedCount = 0;
    let skippedCount = 0;

    // Import metrics in transaction
    await prisma.$transaction(
        async (tx) => {
            for (const metric of parseResult.data) {
                try {
                    // Ensure video exists
                    let video = await tx.youtubeVideo.findUnique({
                        where: { youtubeVideoId: metric.youtubeVideoId },
                    });

                    if (!video) {
                        // Create video placeholder
                        video = await tx.youtubeVideo.create({
                            data: {
                                channelId,
                                youtubeVideoId: metric.youtubeVideoId,
                                titleSnapshot: metric.title,
                                publishedAt: metric.publishedAt,
                            },
                        });
                    } else if (metric.title && !video.titleSnapshot) {
                        // Update title if missing
                        await tx.youtubeVideo.update({
                            where: { id: video.id },
                            data: { titleSnapshot: metric.title },
                        });
                    }

                    // Infer persona if publishedAt exists and persona not set
                    if (video.publishedAt && !video.personaId) {
                        const activePersona = await inferPersonaForVideo(
                            tx,
                            channelId,
                            video.publishedAt
                        );
                        if (activePersona) {
                            await tx.youtubeVideo.update({
                                where: { id: video.id },
                                data: { personaId: activePersona },
                            });
                        }
                    }

                    // Upsert metric
                    await tx.youtubeVideoMetrics.upsert({
                        where: {
                            videoId_date_trafficSource_deviceType: {
                                videoId: video.id,
                                date: metric.date,
                                trafficSource: metric.trafficSource || '',
                                deviceType: metric.deviceType || '',
                            },
                        },
                        create: {
                            videoId: video.id,
                            date: metric.date,
                            views: metric.views,
                            watchTimeMinutes: metric.watchTimeMinutes,
                            avgViewDurationSec: metric.avgViewDurationSec,
                            impressions: metric.impressions,
                            impressionsCtr: metric.impressionsCtr,
                            likes: metric.likes,
                            comments: metric.comments,
                            averageViewedPercent: metric.averageViewedPercent,
                            trafficSource: metric.trafficSource,
                            deviceType: metric.deviceType,
                            source: 'MANUAL',
                            importBatchId: batch.id,
                        },
                        update: {
                            views: metric.views,
                            watchTimeMinutes: metric.watchTimeMinutes,
                            avgViewDurationSec: metric.avgViewDurationSec,
                            impressions: metric.impressions,
                            impressionsCtr: metric.impressionsCtr,
                            likes: metric.likes,
                            comments: metric.comments,
                            averageViewedPercent: metric.averageViewedPercent,
                            importBatchId: batch.id,
                        },
                    });

                    importedCount++;
                } catch (error) {
                    console.error(
                        `Failed to import metric for video ${metric.youtubeVideoId}:`,
                        error
                    );
                    skippedCount++;
                }
            }

            // Update batch stats
            await tx.youtubeImportBatch.update({
                where: { id: batch.id },
                data: {
                    importedRows: importedCount,
                    skippedRows: skippedCount,
                },
            });
        },
        {
            timeout: 60000, // 60s for large imports
        }
    );

    return {
        batchId: batch.id,
        stats: {
            totalRows: parseResult.stats.totalRows,
            imported: importedCount,
            skipped: skippedCount,
            errors: parseResult.errors,
        },
    };
}

/**
 * Infer persona for a video based on channel's active persona at publish time
 */
async function inferPersonaForVideo(
    tx: any,
    channelId: string,
    publishedAt: Date
): Promise<string | null> {
    // Look for active persona in history at the time of publish
    const history = await tx.channelPersonaHistory.findFirst({
        where: {
            channelId,
            activatedAt: { lte: publishedAt },
            OR: [{ deactivatedAt: null }, { deactivatedAt: { gte: publishedAt } }],
        },
        orderBy: { activatedAt: 'desc' },
    });

    if (history) {
        return history.personaId;
    }

    // Fallback: use channel's current persona
    const channel = await tx.channel.findUnique({
        where: { id: channelId },
        select: { personaId: true },
    });

    return channel?.personaId || null;
}

/**
 * Get top performing videos for a channel
 */
export async function getTopVideos(
    channelId: string,
    period: 'last7days' | 'alltime',
    limit: number = 5
) {
    const dateFilter =
        period === 'last7days'
            ? {
                publishedAt: {
                    gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                },
            }
            : {};

    const videos = await prisma.youtubeVideo.findMany({
        where: {
            channelId,
            ...dateFilter,
        },
        include: {
            metrics: {
                orderBy: { date: 'desc' },
                take: 1, // Latest metrics
            },
            persona: {
                select: { id: true, name: true },
            },
        },
        orderBy: {
            metrics: {
                _count: 'desc', // Videos with more data points first
            },
        },
    });

    // Calculate aggregate metrics for each video
    const videosWithStats = await Promise.all(
        videos.map(async (video) => {
            const aggregates = await prisma.youtubeVideoMetrics.aggregate({
                where: { videoId: video.id },
                _sum: {
                    views: true,
                    watchTimeMinutes: true,
                    likes: true,
                },
                _avg: {
                    avgViewDurationSec: true,
                    impressionsCtr: true,
                    averageViewedPercent: true,
                },
            });

            return {
                ...video,
                totalViews: aggregates._sum.views || 0,
                totalWatchTime: aggregates._sum.watchTimeMinutes || 0,
                totalLikes: aggregates._sum.likes || 0,
                avgRetention: aggregates._avg.avgViewDurationSec || 0,
                avgCtr: aggregates._avg.impressionsCtr || 0,
                avgViewPercentage: aggregates._avg.averageViewedPercent || 0,
            };
        })
    );

    // Sort by total views descending
    const sorted = videosWithStats.sort((a, b) => b.totalViews - a.totalViews);

    return sorted.slice(0, limit);
}

/**
 * Get bottom performing videos for a channel
 */
export async function getBottomVideos(channelId: string, limit: number = 5) {
    const videos = await prisma.youtubeVideo.findMany({
        where: { channelId },
        include: {
            metrics: {
                orderBy: { date: 'desc' },
                take: 1,
            },
            persona: {
                select: { id: true, name: true },
            },
        },
    });

    const videosWithStats = await Promise.all(
        videos.map(async (video) => {
            const aggregates = await prisma.youtubeVideoMetrics.aggregate({
                where: { videoId: video.id },
                _sum: { views: true, watchTimeMinutes: true },
                _avg: { avgViewDurationSec: true, impressionsCtr: true },
            });

            return {
                ...video,
                totalViews: aggregates._sum.views || 0,
                totalWatchTime: aggregates._sum.watchTimeMinutes || 0,
                avgRetention: aggregates._avg.avgViewDurationSec || 0,
                avgCtr: aggregates._avg.impressionsCtr || 0,
            };
        })
    );

    // Filter out videos with no data
    const withData = videosWithStats.filter((v) => v.totalViews > 0);

    // Sort by total views ascending
    const sorted = withData.sort((a, b) => a.totalViews - b.totalViews);

    return sorted.slice(0, limit);
}

/**
 * Generate insights for a video based on metrics
 */
export async function generateVideoInsights(videoId: string) {
    const aggregates = await prisma.youtubeVideoMetrics.aggregate({
        where: { videoId },
        _avg: {
            avgViewDurationSec: true,
            impressionsCtr: true,
            averageViewedPercent: true,
        },
        _sum: {
            views: true,
            impressions: true,
        },
    });

    const avgCtr = aggregates._avg.impressionsCtr || 0;
    const avgRetention = aggregates._avg.averageViewedPercent || 0;
    const totalViews = aggregates._sum.views || 0;
    const totalImpressions = aggregates._sum.impressions || 0;

    // Scoring (0-10)
    const ctrScore = Math.min(10, avgCtr * 200); // CTR of 5% = 10 points
    const retentionScore = Math.min(10, avgRetention * 10); // 100% retention = 10 points
    const hookScore =
        avgRetention > 0.7
            ? 10
            : avgRetention > 0.5
                ? 7
                : avgRetention > 0.3
                    ? 5
                    : 3;

    const impressionRate =
        totalImpressions > 0 ? totalViews / totalImpressions : 0;
    const contentScore = (ctrScore + retentionScore) / 2;
    const growthPotential =
        avgCtr > 0.05 && avgRetention > 0.6 ? 9 : avgCtr > 0.03 ? 7 : 5;

    // Diagnosis
    const diagnoses: string[] = [];

    if (avgCtr > 0.05 && avgRetention < 0.4) {
        diagnoses.push(
            '⚠️ High CTR but low retention - thumbnail/title may be misleading'
        );
    }

    if (avgRetention > 0.6 && totalImpressions < 1000) {
        diagnoses.push('📊 High retention but low impressions - under-distributed');
    }

    if (avgRetention < 0.3) {
        diagnoses.push('🎣 Low initial retention - weak hook');
    }

    if (avgCtr < 0.02) {
        diagnoses.push('🎨 Low CTR - improve thumbnail and title');
    }

    if (avgRetention > 0.7 && avgCtr > 0.05) {
        diagnoses.push('✅ Strong performance - high retention and CTR');
    }

    const diagnosis =
        diagnoses.length > 0
            ? diagnoses.join('\n')
            : '📝 Insufficient data for diagnosis';

    // Upsert insight
    await prisma.youtubeVideoInsight.upsert({
        where: { videoId },
        create: {
            videoId,
            hookScore,
            retentionScore,
            ctrScore,
            contentScore,
            growthPotential,
            diagnosis,
        },
        update: {
            hookScore,
            retentionScore,
            ctrScore,
            contentScore,
            growthPotential,
            diagnosis,
        },
    });

    return {
        hookScore,
        retentionScore,
        ctrScore,
        contentScore,
        growthPotential,
        diagnosis,
    };
}

/**
 * Get persona performance comparison
 */
export async function getPersonaPerformance(channelId: string) {
    const videos = await prisma.youtubeVideo.findMany({
        where: {
            channelId,
            personaId: { not: null },
        },
        include: {
            persona: true,
            metrics: true,
        },
    });

    // Group by persona
    const personaStats = new Map<
        string,
        {
            personaId: string;
            personaName: string;
            videoCount: number;
            totalViews: number;
            avgRetention: number;
            avgCtr: number;
        }
    >();

    for (const video of videos) {
        if (!video.persona) continue;

        const existing = personaStats.get(video.personaId!) || {
            personaId: video.personaId!,
            personaName: video.persona.name,
            videoCount: 0,
            totalViews: 0,
            avgRetention: 0,
            avgCtr: 0,
        };

        const videoViews = video.metrics.reduce((sum, m) => sum + (m.views || 0), 0);
        const avgRetention =
            video.metrics.reduce((sum, m) => sum + (m.averageViewedPercent || 0), 0) /
            video.metrics.length || 0;
        const avgCtr =
            video.metrics.reduce((sum, m) => sum + (m.impressionsCtr || 0), 0) /
            video.metrics.length || 0;

        existing.videoCount++;
        existing.totalViews += videoViews;
        existing.avgRetention =
            (existing.avgRetention * (existing.videoCount - 1) + avgRetention) /
            existing.videoCount;
        existing.avgCtr =
            (existing.avgCtr * (existing.videoCount - 1) + avgCtr) / existing.videoCount;

        personaStats.set(video.personaId!, existing);
    }

    return Array.from(personaStats.values()).sort(
        (a, b) => b.totalViews - a.totalViews
    );
}
