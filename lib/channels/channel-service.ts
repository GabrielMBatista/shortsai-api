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
                viewCount: BigInt(ch.statistics?.viewCount || '0')
            }
        }));
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

        if (existing) {
            // Atualizar stats
            return await prisma.channel.update({
                where: { id: existing.id },
                data: {
                    name: channelData.name,
                    description: channelData.description,
                    thumbnail: channelData.thumbnail,
                    subscriberCount: channelData.statistics.subscriberCount,
                    videoCount: channelData.statistics.videoCount,
                    viewCount: channelData.statistics.viewCount,
                    lastSyncedAt: new Date()
                },
                include: { persona: true }
            });
        }

        // Criar novo
        return await prisma.channel.create({
            data: {
                userId,
                googleAccountId: accountId,
                youtubeChannelId,
                name: channelData.name,
                description: channelData.description,
                thumbnail: channelData.thumbnail,
                subscriberCount: channelData.statistics.subscriberCount,
                videoCount: channelData.statistics.videoCount,
                viewCount: channelData.statistics.viewCount,
                lastSyncedAt: new Date(),
                isActive: true
            },
            include: { persona: true }
        });
    }

    /**
     * Lista canais do usuário
     */
    static async getUserChannels(userId: string) {
        return await prisma.channel.findMany({
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

        return await prisma.channel.update({
            where: { id: channelId },
            data: { personaId },
            include: { persona: true }
        });
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

        return await prisma.channel.update({
            where: { id: channelId },
            data: {
                subscriberCount: parseInt(stats.subscriberCount || '0'),
                videoCount: parseInt(stats.videoCount || '0'),
                viewCount: BigInt(stats.viewCount || '0'),
                lastSyncedAt: new Date()
            }
        });
    }
}
