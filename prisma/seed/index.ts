import { PrismaClient } from '@prisma/client';
import { seedBdLocations } from './locations/bd-locations';
import { seedAnimalReferences } from './animals/animal-references';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting reference data seeding...');

  try {
    // Seed Bangladesh locations
    await seedBdLocations(prisma);
    console.log('✓ Bangladesh locations seeded');

    // Seed animal reference data
    await seedAnimalReferences(prisma);
    console.log('✓ Animal reference data seeded');

    console.log('✓ All reference data seeded successfully');
  } catch (error) {
    console.error('✗ Seeding failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();
