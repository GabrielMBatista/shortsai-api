import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const createPrismaClient = () => {
    const databaseUrl = process.env.DATABASE_URL || "";

    // Skip adapter during build to prevent connection hangs
    if (process.env.NEXT_BUILD) {
        // When building with driverAdapters, we must provide an adapter or accelerateUrl.
        // We create a dummy pool and adapter to satisfy the constructor.
        const mockPool = new Pool({ connectionString: "postgres://dummy:dummy@localhost:5432/dummy" });
        // We override the connect method to do nothing
        mockPool.connect = async () => ({
            query: async () => ({ rows: [] }),
            release: () => { },
        } as any);

        const adapter = new PrismaPg(mockPool);
        return new PrismaClient({
            adapter,
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
