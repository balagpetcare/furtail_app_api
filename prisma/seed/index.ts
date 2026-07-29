import { seedAnimalReferences } from './animals/animal-references';
import { seedBdLocations } from './locations/bd-locations';
import { disconnectPrisma, getPrisma } from '../../src/infrastructure/db/prisma-client';

const prisma = getPrisma();

async function main() {
  console.log('Starting reference data seeding...');

  try {
    await seedBdLocations(prisma);
    console.log('Bangladesh locations seeded');

    await seedAnimalReferences(prisma);
    console.log('Animal reference data seeded');

    console.log('All reference data seeded successfully');
  } catch (error) {
    console.error('Seeding failed:', error);
    throw error;
  } finally {
    await disconnectPrisma();
  }
}

main();
