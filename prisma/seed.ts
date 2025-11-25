import { prisma } from "../lib/prisma";

async function main() {
    console.log("🌱 Starting database seed...");

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

    console.log("✅ Admin user created:", {
        id: adminUser.id,
        email: adminUser.email,
        name: adminUser.name,
    });

    // Criar API keys para o admin (opcional)
    await prisma.apiKey.upsert({
        where: { user_id: adminUser.id },
        update: {},
        create: {
            user_id: adminUser.id,
            gemini_key: null,
            elevenlabs_key: null,
            suno_key: null,
        },
    });

    console.log("✅ API keys created for admin");

    console.log("\n🎉 Seed completed successfully!");
    console.log("\n📝 Admin credentials:");
    console.log("   Email: admin@shortsai.com");
    console.log("   ID:", adminUser.id);
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e: any) => {
        console.error("❌ Seed failed:", e);
        await prisma.$disconnect();
        process.exit(1);
    });
