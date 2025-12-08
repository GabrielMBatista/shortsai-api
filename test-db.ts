
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    try {
        console.log('Testing connection to database...');
        await prisma.$connect();
        console.log('Connection successful.');

        console.log('Checking Folder model...');
        const folderCount = await prisma.folder.count();
        console.log(`Folder count: ${folderCount}`);

        console.log('Checking User model...');
        const userCount = await prisma.user.count();
        console.log(`User count: ${userCount}`);

    } catch (e) {
        console.error('Test failed:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
