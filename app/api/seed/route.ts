import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST() {
    try {
        // Criar usuário admin
        const adminUser = await prisma.user.upsert({
            where: { email: "admin@shortsai.com" },
            update: {},
            create: {
                email: "admin@shortsai.com",
                name: "Admin ShortsAI",
                avatar_url: "https://api.dicebear.com/7.x/avataaars/svg?seed=admin",
                google_id: "admin-google-id",
                subscription_plan: "PRO",
            },
        });

        // Criar API keys para o admin
        const apiKeys = await prisma.apiKey.upsert({
            where: { user_id: adminUser.id },
            update: {},
            create: {
                user_id: adminUser.id,
                gemini_key: null,
                elevenlabs_key: null,
                suno_key: null,
            },
        });

        return NextResponse.json({
            success: true,
            message: "Admin user created successfully",
            user: {
                id: adminUser.id,
                email: adminUser.email,
                name: adminUser.name,
                subscription_plan: adminUser.subscription_plan,
            },
        });
    } catch (error) {
        console.error('Error creating admin user:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: String(error) }, { status: 500 });
    }
}
