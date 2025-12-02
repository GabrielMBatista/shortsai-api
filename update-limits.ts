
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const userId = '2fecd504-47c6-4bb1-80f5-7c697f0dc6ed';
    console.log(`Updating limits for user ${userId}...`);

    try {
        const updated = await prisma.userLimits.update({
            where: { user_id: userId },
            data: {
                monthly_videos_limit: 100,
                current_videos_used: 0 // Reset usage too just in case
            }
        });
        console.log('Updated limits:', updated);
    } catch (e) {
        console.error('Error updating limits:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
