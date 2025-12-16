import { prisma } from '@/lib/prisma';
import { google } from 'googleapis';

export class ChannelService {
    /**
     * Descobre canais YouTube do usuário via Google Account
     */
    static async discoverChannels(userId: string, accountId: string) {
        const account = await prisma.account.findUnique({
            where: { id: accountId }
        });

        if (!account || account.userId !== userId) {
            throw new Error('Account não encontrada ou não pertence ao usuário');
        }

        if (!account.refresh_token) {
            throw new Error('Refresh token não disponível');
        }

        // Setup OAuth2 client
        const authClient = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );

        authClient.setCredentials({
            refresh_token: account.refresh_token,
            access_token: account.access_token || undefined
        });

        const youtube = google.youtube({ version: 'v3', auth: authClient });
        const oauth2 = google.oauth2({ version: 'v2', auth: authClient });

        // Buscar canais e email
        const [channelsResponse, userResponse] = await Promise.all([
            youtube.channels.list({ part: ['snippet', 'statistics'], mine: true }),
            oauth2.userinfo.get().catch(() => ({ data: { email: undefined } }))
        ]);

        const channels = channelsResponse.data.items || [];
        const email = userResponse.data.email;

        return channels.map(ch => ({
            youtubeChannelId: ch.id!,
            name: ch.snippet?.title || 'Unknown Channel',
            description: ch.snippet?.description,
            thumbnail: ch.snippet?.thumbnails?.default?.url,
            email,
            statistics: {
                subscriberCount: parseInt(ch.statistics?.subscriberCount || '0'),
                videoCount: parseInt(ch.statistics?.videoCount || '0'),
                viewCount: (ch.statistics?.viewCount || '0')
            }
        }));
    }

    private static serialize(channel: any) {
        if (!channel) return null;
        return {
            ...channel,
            viewCount: channel.viewCount ? channel.viewCount.toString() : '0',
            // Handle nested relations if necessary, but shallow copy usually preserves them unless they also have BigInts
            // Account doesn't have BigInts. Persona doesn't.
        };
    }

    /**
     * Importa/cria canal no banco
     */
    static async importChannel(userId: string, accountId: string, youtubeChannelId: string) {
        // Descobrir dados do canal
        const discovered = await this.discoverChannels(userId, accountId);
        const channelData = discovered.find(ch => ch.youtubeChannelId === youtubeChannelId);

        if (!channelData) {
            throw new Error('Canal não encontrado na conta Google');
        }

        // Verificar se já existe
        const existing = await prisma.channel.findFirst({
            where: { userId, youtubeChannelId }
        });

        let channel;

        if (existing) {
            // Atualizar stats
            channel = await prisma.channel.update({
                where: { id: existing.id },
                data: {
                    name: channelData.name,
                    description: channelData.description,
                    thumbnail: channelData.thumbnail,
                    subscriberCount: channelData.statistics.subscriberCount,
                    videoCount: channelData.statistics.videoCount,
                    viewCount: BigInt(channelData.statistics.viewCount), // Store as BigInt
                    lastSyncedAt: new Date()
                },
                include: { persona: true }
            });
        } else {
            // Criar novo
            channel = await prisma.channel.create({
                data: {
                    userId,
                    googleAccountId: accountId,
                    youtubeChannelId,
                    name: channelData.name,
                    description: channelData.description,
                    thumbnail: channelData.thumbnail,
                    subscriberCount: channelData.statistics.subscriberCount,
                    videoCount: channelData.statistics.videoCount,
                    viewCount: BigInt(channelData.statistics.viewCount), // Store as BigInt
                    lastSyncedAt: new Date(),
                    isActive: true
                },
                include: { persona: true }
            });
        }

        return this.serialize(channel);
    }

    /**
     * Lista canais do usuário
     */
    static async getUserChannels(userId: string) {
        const channels = await prisma.channel.findMany({
            where: { userId, isActive: true },
            include: {
                persona: {
                    select: {
                        id: true,
                        name: true,
                        category: true,
                        isOfficial: true,
                        isFeatured: true
                    }
                },
                account: {
                    select: {
                        id: true,
                        provider: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        return channels.map(c => this.serialize(c));
    }

    /**
     * Atribui persona ao canal
     */
    static async assignPersona(channelId: string, userId: string, personaId: string | null) {
        const channel = await prisma.channel.findUnique({
            where: { id: channelId }
        });

        if (!channel || channel.userId !== userId) {
            throw new Error('Canal não encontrado ou não pertence ao usuário');
        }

        // Verificar acesso à persona
        if (personaId) {
            const { PersonaService } = await import('../personas/persona-service');
            const hasAccess = await PersonaService.canAccessPersona(userId, personaId);
            if (!hasAccess) {
                throw new Error('Sem acesso a esta persona');
            }
        }

        const updated = await prisma.channel.update({
            where: { id: channelId },
            data: { personaId },
            include: { persona: true }
        });

        return this.serialize(updated);
    }

    /**
     * Sincroniza stats do YouTube
     */
    static async syncChannelStats(channelId: string) {
        const channel = await prisma.channel.findUnique({
            where: { id: channelId },
            include: { account: true }
        });

        if (!channel) throw new Error('Canal não encontrado');

        const account = channel.account;
        if (!account.refresh_token) {
            throw new Error('Refresh token não disponível');
        }

        const authClient = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );

        authClient.setCredentials({
            refresh_token: account.refresh_token,
            access_token: account.access_token || undefined
        });

        const youtube = google.youtube({ version: 'v3', auth: authClient });

        const response = await youtube.channels.list({
            part: ['statistics'],
            id: [channel.youtubeChannelId]
        });

        const stats = response.data.items?.[0]?.statistics;
        if (!stats) throw new Error('Stats não disponíveis');

        const updated = await prisma.channel.update({
            where: { id: channelId },
            data: {
                subscriberCount: parseInt(stats.subscriberCount || '0'),
                videoCount: parseInt(stats.videoCount || '0'),
                viewCount: BigInt(stats.viewCount || '0'),
                lastSyncedAt: new Date()
            }
        });

        // ✅ Sincronizar vídeos também
        try {
            const videos = await this.getChannelVideos(channelId, { maxResults: 100 });

            console.log(`[ChannelService] Syncing ${videos.length} videos for channel ${channelId}`);

            // Salvar/atualizar vídeos no banco
            for (const video of videos) {
                // Parse duration ISO 8601 (PT1M30S → segundos)
                let durationSec = null;
                if (video.duration) {
                    const match = video.duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
                    if (match) {
                        const hours = parseInt(match[1] || '0');
                        const minutes = parseInt(match[2] || '0');
                        const seconds = parseInt(match[3] || '0');
                        durationSec = hours * 3600 + minutes * 60 + seconds;
                    }
                }

                await prisma.youtubeVideo.upsert({
                    where: {
                        youtubeVideoId: video.id
                    },
                    update: {
                        titleSnapshot: video.title,
                        durationSec,
                        publishedAt: video.publishedAt ? new Date(video.publishedAt) : null,
                        updatedAt: new Date()
                    },
                    create: {
                        id: `${channelId}_${video.id}`,
                        channelId,
                        youtubeVideoId: video.id,
                        titleSnapshot: video.title,
                        durationSec,
                        publishedAt: video.publishedAt ? new Date(video.publishedAt) : null
                    }
                });

                // Salvar métricas em YoutubeVideoMetrics
                await prisma.youtubeVideoMetrics.create({
                    data: {
                        videoId: `${channelId}_${video.id}`,
                        date: new Date(),
                        views: video.statistics.viewCount,
                        likes: video.statistics.likeCount,
                        comments: video.statistics.commentCount,
                        source: 'API'
                    }
                });
            }

            console.log(`[ChannelService] Successfully synced ${videos.length} videos`);
        } catch (error) {
            console.error('[ChannelService] Failed to sync videos:', error);
            // Não falhar a operação inteira se só os vídeos falharem
        }

        return this.serialize(updated);
    }

    /**
     * Busca últimos vídeos do canal no YouTube
     * @param channelId - ID do canal no banco
     * @param options - Opções de busca (maxResults, orderBy)
     * @returns Lista de vídeos com estatísticas
     */
    static async getChannelVideos(
        channelId: string,
        options?: {
            maxResults?: number;
            orderBy?: 'date' | 'viewCount';
        }
    ) {
        const channel = await prisma.channel.findUnique({
            where: { id: channelId },
            include: { account: true }
        });

        if (!channel) throw new Error('Canal não encontrado');

        const account = channel.account;
        if (!account.refresh_token) {
            throw new Error('Refresh token não disponível');
        }

        const authClient = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );

        authClient.setCredentials({
            refresh_token: account.refresh_token,
            access_token: account.access_token || undefined
        });

        const youtube = google.youtube({ version: 'v3', auth: authClient });

        try {
            // 1. Buscar upload playlist do canal
            const channelResponse = await youtube.channels.list({
                part: ['contentDetails'],
                id: [channel.youtubeChannelId]
            });

            const uploadsPlaylistId = channelResponse.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

            if (!uploadsPlaylistId) {
                console.warn(`[ChannelService] No uploads playlist for channel ${channel.youtubeChannelId}`);
                return [];
            }

            // 2. Buscar vídeos da playlist
            const maxResults = options?.maxResults || 50;
            const playlistResponse = await youtube.playlistItems.list({
                part: ['snippet', 'contentDetails'],
                playlistId: uploadsPlaylistId,
                maxResults: Math.min(maxResults, 50) // YouTube API limit per page
            });

            const videoIds = playlistResponse.data.items
                ?.map(item => item.contentDetails?.videoId)
                .filter((id): id is string => Boolean(id)) || [];

            if (videoIds.length === 0) {
                return [];
            }

            // 3. Buscar detalhes dos vídeos (incluindo statistics)
            const videosResponse = await youtube.videos.list({
                part: ['snippet', 'statistics', 'contentDetails'],
                id: videoIds as string[]
            });

            let videos = (videosResponse.data.items || []).map((video: any) => ({
                id: video.id!,
                title: video.snippet?.title || '',
                description: video.snippet?.description || '',
                tags: video.snippet?.tags || [],
                publishedAt: video.snippet?.publishedAt,
                thumbnails: video.snippet?.thumbnails,
                statistics: {
                    viewCount: parseInt(video.statistics?.viewCount || '0'),
                    likeCount: parseInt(video.statistics?.likeCount || '0'),
                    commentCount: parseInt(video.statistics?.commentCount || '0')
                },
                duration: video.contentDetails?.duration, // ISO 8601 format (PT1M30S)
            }));

            // 4. Ordenar se solicitado
            if (options?.orderBy === 'viewCount') {
                videos = videos.sort((a: any, b: any) => b.statistics.viewCount - a.statistics.viewCount);
            }
            // Por padrão já vem ordenado por data (mais recentes primeiro)

            return videos;
        } catch (error: any) {
            console.error('[ChannelService] Failed to fetch channel videos:', error.message);

            // Se erro de quota ou autenticação, não falhar completamente
            if (error.code === 403 || error.code === 401) {
                console.warn('[ChannelService] YouTube API quota exceeded or auth failed, returning empty');
                return [];
            }

            throw error;
        }
    }
}
