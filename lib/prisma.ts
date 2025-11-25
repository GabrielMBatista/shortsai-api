import { PrismaClient } from "@prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";

const createPrismaClient = () => {
    if (!process.env.DATABASE_URL) {
        console.warn("DATABASE_URL is not defined. Prisma Client will fail to connect.");
    }
    return new PrismaClient().$extends(withAccelerate());
};

const globalForPrisma = global as unknown as {
    prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export function getPrismaClient() {
    return prisma;
}
