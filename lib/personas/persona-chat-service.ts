import { prisma } from '@/lib/prisma';

/**
 * PersonaChatService
 * Gerencia histórico de conversas com personas
 * - Máximo 5 chats ativos por persona/usuário
 * - Auto-limpeza após 1 semana
 */
export class PersonaChatService {
    /**
     * Busca todos os chats ativos de uma persona para um usuário
     */
    static async getUserChats(userId: string, personaId: string) {
        return await prisma.personaChat.findMany({
            where: {
                userId,
                personaId,
                isActive: true,
                expiresAt: { gt: new Date() } // Apenas chats não expirados
            },
            orderBy: { lastMessageAt: 'desc' },
            take: 5, // Máximo 5 chats
            include: {
                messages: {
                    orderBy: { createdAt: 'asc' },
                    select: {
                        id: true,
                        role: true,
                        content: true,
                        createdAt: true
                    }
                },
                persona: {
                    select: {
                        id: true,
                        name: true,
                        category: true
                    }
                }
            }
        });
    }

    /**
     * Busca um chat específico com suas mensagens
     */
    static async getChat(chatId: string, userId: string) {
        const chat = await prisma.personaChat.findFirst({
            where: {
                id: chatId,
                userId,
                isActive: true
            },
            include: {
                messages: {
                    orderBy: { createdAt: 'asc' }
                },
                persona: true
            }
        });

        if (!chat) {
            throw new Error('Chat not found or expired');
        }

        return chat;
    }

    /**
     * Cria um novo chat
     * - Se já existem 5 chats, remove o mais antigo
     */
    static async createChat(userId: string, personaId: string, channelId?: string, title?: string) {
        // Verificar quantos chats ativos existem
        const activeChats = await prisma.personaChat.findMany({
            where: {
                userId,
                personaId,
                isActive: true,
                expiresAt: { gt: new Date() }
            },
            orderBy: { lastMessageAt: 'asc' }
        });

        // Se já tem 5 chats, desativar o mais antigo
        if (activeChats.length >= 5) {
            await prisma.personaChat.update({
                where: { id: activeChats[0].id },
                data: { isActive: false }
            });
        }

        // Criar novo chat
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 1 semana

        const chat = await prisma.personaChat.create({
            data: {
                userId,
                personaId,
                channelId,
                title: title || 'New Chat',
                expiresAt
            },
            include: {
                persona: true
            }
        });

        return chat;
    }

    /**
     * Adiciona uma mensagem a um chat existente
     */
    static async addMessage(chatId: string, userId: string, role: 'user' | 'model', content: string) {
        // Verificar se o chat pertence ao usuário e está ativo
        const chat = await prisma.personaChat.findFirst({
            where: {
                id: chatId,
                userId,
                isActive: true
            }
        });

        if (!chat) {
            throw new Error('Chat not found or expired');
        }

        // Adicionar mensagem
        const message = await prisma.personaChatMessage.create({
            data: {
                chatId,
                role,
                content
            }
        });

        // Atualizar lastMessageAt do chat
        await prisma.personaChat.update({
            where: { id: chatId },
            data: { lastMessageAt: new Date() }
        });

        return message;
    }

    /**
     * Atualiza o título de um chat
     */
    static async updateChatTitle(chatId: string, userId: string, title: string) {
        const chat = await prisma.personaChat.findFirst({
            where: {
                id: chatId,
                userId,
                isActive: true
            }
        });

        if (!chat) {
            throw new Error('Chat not found or expired');
        }

        return await prisma.personaChat.update({
            where: { id: chatId },
            data: { title }
        });
    }

    /**
     * Deleta um chat (marca como inativo)
     */
    static async deleteChat(chatId: string, userId: string) {
        const chat = await prisma.personaChat.findFirst({
            where: {
                id: chatId,
                userId
            }
        });

        if (!chat) {
            throw new Error('Chat not found');
        }

        return await prisma.personaChat.update({
            where: { id: chatId },
            data: { isActive: false }
        });
    }

    /**
     * Limpa chats expirados (executado por cron job)
     */
    static async cleanupExpiredChats() {
        const result = await prisma.personaChat.updateMany({
            where: {
                expiresAt: { lt: new Date() },
                isActive: true
            },
            data: {
                isActive: false
            }
        });

        console.log(`[PersonaChatService] Cleaned up ${result.count} expired chats`);
        return result.count;
    }

    /**
     * Gera um título automático baseado na primeira mensagem do usuário
     */
    static async generateChatTitle(firstMessage: string): Promise<string> {
        // Pegar as primeiras 50 caracteres ou até o primeiro ponto/quebra
        const truncated = firstMessage
            .split(/[.\n\r]/)[0]
            .substring(0, 50)
            .trim();

        return truncated || 'New Chat';
    }
}
