import { getPrisma } from '../src/infrastructure/db/prisma-client';

async function main() {
  const prisma = getPrisma();
  const mediaCount = await prisma.media.count();
  console.log(`Total Media rows: ${mediaCount}`);

  const sampleMedia = await prisma.media.findMany({
    take: 15,
    orderBy: { createdAt: 'desc' }
  });

  console.log('\n--- Sample Media Rows (Last 15) ---');
  for (const m of sampleMedia) {
    console.log(`ID: ${m.id} | Key: ${m.storageKey} | URL: ${m.url} | Thumbnail: ${m.thumbnailUrl}`);
  }

  // Count host variations
  const localhostCount = await prisma.media.count({
    where: { url: { contains: 'localhost' } }
  });
  const emulatorCount = await prisma.media.count({
    where: { url: { contains: '10.0.2.2' } }
  });
  const relativeCount = await prisma.media.count({
    where: { NOT: { url: { startsWith: 'http' } } }
  });

  console.log('\n--- Host/URL Statistics ---');
  console.log(`Localhost URLs: ${localhostCount}`);
  console.log(`10.0.2.2 (Emulator) URLs: ${emulatorCount}`);
  console.log(`Relative URLs: ${relativeCount}`);

  await prisma.$disconnect();
}

main().catch(console.error);
