import { seedPostTaxonomies } from './post-taxonomies';
import { disconnectPrisma, getPrisma } from '../../../src/infrastructure/db/prisma-client';

const prisma = getPrisma();

async function main() {
  await seedPostTaxonomies(prisma);
  console.log('Post taxonomies seeded');
}

main()
  .catch((error) => {
    console.error('Seeding failed:', error);
    process.exitCode = 1;
  })
  .finally(() => disconnectPrisma());
