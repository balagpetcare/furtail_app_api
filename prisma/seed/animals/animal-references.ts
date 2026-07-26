import { PrismaClient } from '@prisma/client';

/**
 * Seed animal reference data (categories, types, sizes, colors, patterns, breeds)
 * Expected counts from legacy system:
 * - AnimalCategory: ~10
 * - AnimalType: ~100-200
 * - AnimalSize: ~10
 * - AnimalColor: ~20-30
 * - CoatPattern: ~15-25
 * - Breed: ~1,000-5,000 (varies by number of types)
 *
 * Status: PLACEHOLDER STRUCTURE
 * Actual data will be imported from legacy database or JSON seed files during DB Step 3.
 */

export async function seedAnimalReferences(prisma: PrismaClient) {
  console.log('Seeding animal reference data...');

  // Check if data already exists (idempotent)
  const categoryCount = await prisma.animalCategory.count();
  if (categoryCount > 0) {
    console.log(`  Skipping: ${categoryCount} categories already exist`);
    return;
  }

  // Seed animal categories (top-level taxonomy)
  const categories = [
    { code: 'MAMMAL', name: 'Mammals' },
    { code: 'BIRD', name: 'Birds' },
  ];

  const createdCategories = [];
  for (const catData of categories) {
    const cat = await prisma.animalCategory.upsert({
      where: { code: catData.code },
      update: {},
      create: catData,
    });
    createdCategories.push(cat);
  }
  console.log(
    `  Created ${createdCategories.length} categories (placeholder data for schema validation)`,
  );

  // Seed animal types (species)
  const animalTypes = [
    {
      name: 'Dog',
      code: 'DOG',
      categoryId: createdCategories.find((c) => c.code === 'MAMMAL')?.id,
      scientificName: 'Canis lupus familiaris',
      icon: '🐕',
    },
    {
      name: 'Cat',
      code: 'CAT',
      categoryId: createdCategories.find((c) => c.code === 'MAMMAL')?.id,
      scientificName: 'Felis catus',
      icon: '🐈',
    },
  ];

  const createdTypes = [];
  for (const typeData of animalTypes) {
    const type = await prisma.animalType.upsert({
      where: { name: typeData.name },
      update: {},
      create: typeData,
    });
    createdTypes.push(type);
  }
  console.log(
    `  Created ${createdTypes.length} animal types (placeholder data for schema validation)`,
  );

  // Seed animal sizes
  const sizes = [
    { code: 'XS', name: 'Extra Small', minWeightKg: 0, maxWeightKg: 2 },
    { code: 'S', name: 'Small', minWeightKg: 2, maxWeightKg: 5 },
    { code: 'M', name: 'Medium', minWeightKg: 5, maxWeightKg: 15 },
    { code: 'L', name: 'Large', minWeightKg: 15, maxWeightKg: 30 },
  ];

  const createdSizes = [];
  for (const sizeData of sizes) {
    const size = await prisma.animalSize.upsert({
      where: { code: sizeData.code },
      update: {},
      create: sizeData,
    });
    createdSizes.push(size);
  }
  console.log(`  Created ${createdSizes.length} sizes (placeholder data for schema validation)`);

  // Seed animal colors
  const colors = [
    { code: 'BLACK', name: 'Black', hexPreview: '#000000' },
    { code: 'WHITE', name: 'White', hexPreview: '#FFFFFF' },
    { code: 'BROWN', name: 'Brown', hexPreview: '#8B4513' },
  ];

  for (const colorData of colors) {
    await prisma.animalColor.upsert({
      where: { code: colorData.code },
      update: {},
      create: colorData,
    });
  }
  console.log(`  Created ${colors.length} colors (placeholder data for schema validation)`);

  // Seed coat patterns
  const patterns = [
    { code: 'SOLID', name: 'Solid' },
    { code: 'SPOTTED', name: 'Spotted' },
    { code: 'STRIPED', name: 'Striped' },
  ];

  for (const patternData of patterns) {
    await prisma.coatPattern.upsert({
      where: { code: patternData.code },
      update: {},
      create: patternData,
    });
  }
  console.log(
    `  Created ${patterns.length} coat patterns (placeholder data for schema validation)`,
  );

  // Seed breeds (sample only; production will have ~1000+)
  const dogType = createdTypes.find((t) => t.code === 'DOG');
  const largeSize = createdSizes.find((s) => s.code === 'L');

  if (dogType && largeSize) {
    const breeds = [
      {
        name: 'German Shepherd',
        animalTypeId: dogType.id,
        code: 'GERMAN_SHEPHERD',
        defaultSizeId: largeSize.id,
        originCountry: 'Germany',
      },
      {
        name: 'Labrador',
        animalTypeId: dogType.id,
        code: 'LABRADOR',
        defaultSizeId: largeSize.id,
        originCountry: 'Canada',
      },
    ];

    for (const breedData of breeds) {
      await prisma.breed.upsert({
        where: {
          name_animalTypeId: { name: breedData.name, animalTypeId: breedData.animalTypeId },
        },
        update: {},
        create: breedData,
      });
    }
    console.log(`  Created ${breeds.length} breeds (placeholder data for schema validation)`);
  }

  console.log('  Note: Production animal data will be imported from legacy database');
}
