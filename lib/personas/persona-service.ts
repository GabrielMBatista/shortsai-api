import { prisma } from '@/lib/prisma';
import { Persona, PersonaType, PersonaVisibility } from '@prisma/client';

export class PersonaService {
    /**
     * Lista personas disponíveis para o usuário baseado no plano
     */
    static async getAvailablePersonas(userId: string) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { plan: true }
        });

        const userPlan = user?.plan?.slug || 'free';

        return await prisma.persona.findMany({
            where: {
                isActive: true,
                OR: [
                    // Personas SYSTEM públicas para o plano do usuário
                    {
                        type: 'SYSTEM',
                        visibility: 'PUBLIC',
                        OR: [
                            { isPremium: false }, // Gratuitas para todos
                            { requiredPlan: userPlan } // Premium se plano compatível
                        ]
                    },
                    // Personas CUSTOM do próprio usuário
                    {
                        type: 'CUSTOM',
                        ownerId: userId
                    }
                ]
            },
            orderBy: [
                { isFeatured: 'desc' },
                { isOfficial: 'desc' },
                { usageCount: 'desc' },
                { name: 'asc' }
            ]
        });
    }

    /**
     * Obtém uma persona específica
     */
    static async getPersona(personaId: string) {
        return await prisma.persona.findUnique({
            where: { id: personaId },
            include: {
                creator: { select: { id: true, name: true, email: true } },
                owner: { select: { id: true, name: true, email: true } }
            }
        });
    }

    /**
     * Verifica se usuário tem acesso a uma persona
     */
    static async canAccessPersona(userId: string, personaId: string): Promise<boolean> {
        const persona = await this.getPersona(personaId);
        if (!persona || !persona.isActive) return false;

        // CUSTOM: apenas dono
        if (persona.type === 'CUSTOM') {
            return persona.ownerId === userId;
        }

        // SYSTEM: verificar plano
        if (persona.type === 'SYSTEM') {
            if (!persona.isPremium) return true; // Free para todos

            const user = await prisma.user.findUnique({
                where: { id: userId },
                include: { plan: true }
            });

            const userPlan = user?.plan?.slug || 'free';
            const planHierarchy: Record<string, number> = { free: 0, pro: 1, enterprise: 2 };

            return planHierarchy[userPlan] >= planHierarchy[persona.requiredPlan];
        }

        return false;
    }

    /**
     * Cria uma persona CUSTOM
     */
    static async createCustomPersona(userId: string, data: {
        name: string;
        description?: string;
        category?: string;
        systemInstruction: string;
        temperature?: number;
        topP?: number;
        topK?: number;
        maxOutputTokens?: number;
        tags?: string[];
    }) {
        // Verificar limite do plano
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                plan: true,
                personasOwned: { where: { isActive: true } }
            }
        });

        const planLimits: Record<string, number> = {
            free: 0,
            pro: 5,
            enterprise: 999
        };

        const userPlan = user?.plan?.slug || 'free';
        const limit = planLimits[userPlan];
        const current = user?.personasOwned.length || 0;

        if (current >= limit) {
            throw new Error(`Limite de ${limit} personas atingido para o plano ${userPlan}`);
        }

        return await prisma.persona.create({
            data: {
                type: 'CUSTOM',
                visibility: 'PRIVATE',
                ownerId: userId,
                isActive: true,
                version: 1,
                ...data
            }
        });
    }

    /**
     * Atualiza uma persona
     */
    static async updatePersona(personaId: string, userId: string, data: Partial<Persona>) {
        const persona = await this.getPersona(personaId);
        if (!persona) throw new Error('Persona não encontrada');

        // Verificar permissão
        const isOwner = persona.ownerId === userId;
        const isAdmin = await this.isUserAdmin(userId);

        if (!isOwner && !isAdmin) {
            throw new Error('Sem permissão para editar esta persona');
        }

        // Criar snapshot histórico
        await this.createHistorySnapshot(personaId, userId, 'User update');

        // Atualizar
        return await prisma.persona.update({
            where: { id: personaId },
            data: {
                ...data,
                version: { increment: 1 },
                updatedAt: new Date()
            }
        });
    }

    /**
     * Registra uso de persona
     */
    static async trackUsage(personaId: string, userId: string, projectId: string | null, success: boolean, duration?: number) {
        await prisma.$transaction([
            // Incrementar contador
            prisma.persona.update({
                where: { id: personaId },
                data: {
                    usageCount: { increment: 1 },
                    lastUsedAt: new Date()
                }
            }),
            // Criar log
            prisma.personaUsageLog.create({
                data: {
                    personaId,
                    userId,
                    projectId,
                    action: 'script_generation',
                    success,
                    duration,
                    createdAt: new Date()
                }
            })
        ]);
    }

    /**
     * Cria snapshot histórico
     */
    private static async createHistorySnapshot(personaId: string, changedBy: string, reason: string) {
        const persona = await this.getPersona(personaId);
        if (!persona) return;

        await prisma.personaHistory.create({
            data: {
                personaId,
                version: persona.version,
                snapshot: persona as any,
                changedBy,
                changeReason: reason,
                createdAt: new Date()
            }
        });
    }

    /**
     * Verifica se usuário é admin
     */
    private static async isUserAdmin(userId: string): Promise<boolean> {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { role: true }
        });
        return user?.role === 'ADMIN';
    }
}
