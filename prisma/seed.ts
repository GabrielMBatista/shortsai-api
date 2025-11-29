import { prisma } from "../lib/prisma";

async function main() {
    console.log("🌱 Starting database seed...");

    // Criar usuário admin
    const adminUser = await prisma.user.upsert({
        where: { email: "elaofhell2@gmail.com" },
        update: {
            role: "ADMIN",
            subscription_plan: "PRO",
            tier: "pro"
        },
        create: {
            email: "elaofhell2@gmail.com",
            name: "Admin ShortsAI",
            avatar_url: "https://api.dicebear.com/7.x/avataaars/svg?seed=admin",
            google_id: "admin-google-id",
            role: "ADMIN",
            subscription_plan: "PRO",
            tier: "pro"
        },
    });

    console.log("✅ Admin user created:", {
        id: adminUser.id,
        email: adminUser.email,
        name: adminUser.name,
        role: adminUser.role
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
