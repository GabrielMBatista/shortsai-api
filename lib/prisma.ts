import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { withAccelerate } from "@prisma/extension-accelerate";
import { Pool } from "pg";

const prismaClientSingleton = (): PrismaClient => {
    try {
        const databaseUrl = process.env.DATABASE_URL || "";

        // Se a URL começar com "prisma+postgres://", usar Prisma Accelerate
        if (databaseUrl.startsWith("prisma+postgres://")) {
            console.log("Using Prisma Accelerate");
            return new PrismaClient({
                log: ['query', 'error', 'warn'],
            }).$extends(withAccelerate()) as any as PrismaClient;
        }

        // Caso contrário, usar driver adapter do PostgreSQL
        console.log("Using PostgreSQL adapter");
        const pool = new Pool({ connectionString: databaseUrl });
        const adapter = new PrismaPg(pool);

        return new PrismaClient({
            adapter,
            log: ['query', 'error', 'warn'],
        });
    } catch (error) {
        console.error("Failed to initialize Prisma Client:", error);
        throw error;
    }
};

type PrismaClientSingleton = PrismaClient;

const globalForPrisma = global as unknown as {
    prisma: PrismaClientSingleton | undefined;
};

export const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export function getPrismaClient() {
    return prisma;
}
