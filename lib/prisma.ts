import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const createPrismaClient = () => {
    const databaseUrl = process.env.DATABASE_URL || "";

    // Skip adapter during build to prevent connection hangs
    if (process.env.NEXT_BUILD) {
        return new PrismaClient({
            log: ['error', 'warn'],
        });
    }

    // Usar driver adapter do PostgreSQL
    const pool = new Pool({ connectionString: databaseUrl });
    const adapter = new PrismaPg(pool);

    return new PrismaClient({
        adapter,
        log: ['error', 'warn'],
    });
};

const globalForPrisma = global as unknown as {
    prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export function getPrismaClient() {
    return prisma;
}
