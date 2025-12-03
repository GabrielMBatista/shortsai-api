
import { prisma } from '../lib/prisma';

async function main() {
  console.log('Checking prisma.folder...');
  if ('folder' in prisma) {
    console.log('prisma.folder exists!');
    // @ts-ignore
    const count = await prisma.folder.count();
    console.log(`Folder count: ${count}`);
  } else {
    console.error('prisma.folder does NOT exist');
    console.log('Available models:', Object.keys(prisma).filter(k => !k.startsWith('_') && !k.startsWith('$')));
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
