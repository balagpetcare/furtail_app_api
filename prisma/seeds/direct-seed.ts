/**
 * Direct seed execution script
 * Loads JSON data and inserts into database using Prisma
 */

import * as fs from 'fs';
import * as path from 'path';

// Dynamically import Prisma Client to avoid module resolution issues
async function runSeed() {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  try {
    console.log('Starting reference data seeding...');

    // Load and seed divisions
    const divisionsData = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'data/bd-divisions.json'), 'utf-8'),
    );
    console.log(`\nSeeding ${divisionsData.length} divisions...`);
    for (const division of divisionsData) {
      await prisma.bdDivision.upsert({
        where: { code: division.code },
        update: {},
        create: division,
      });
    }
    console.log(`✓ Seeded ${divisionsData.length} divisions`);

    // Load and seed districts
    const districtsData = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'data/bd-districts.json'), 'utf-8'),
    );
    console.log(`\nSeeding ${districtsData.length} districts...`);
    for (const district of districtsData) {
      await prisma.bdDistrict.upsert({
        where: { code: district.code },
        update: {},
        create: district,
      });
    }
    console.log(`✓ Seeded ${districtsData.length} districts`);

    // Load and seed upazilas
    const upazilaData = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'data/bd-upazilas.json'), 'utf-8'),
    );
    console.log(`\nSeeding ${upazilaData.length} upazilas...`);
    for (const upazila of upazilaData) {
      await prisma.bdUpazila.upsert({
        where: { code: upazila.code },
        update: {},
        create: upazila,
      });
    }
    console.log(`✓ Seeded ${upazilaData.length} upazilas`);

    // Load and seed unions
    const unionsData = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'data/bd-unions.json'), 'utf-8'),
    );
    console.log(`\nSeeding ${unionsData.length} unions...`);
    for (const union of unionsData) {
      await prisma.bdUnion.upsert({
        where: { code: union.code },
        update: {},
        create: union,
      });
    }
    console.log(`✓ Seeded ${unionsData.length} unions`);

    // Load and seed areas
    const areasData = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'data/bd-areas.json'), 'utf-8'),
    );
    console.log(`\nSeeding ${areasData.length} areas...`);
    for (const area of areasData) {
      await prisma.bdArea.upsert({
        where: { code: area.code },
        update: {},
        create: area,
      });
    }
    console.log(`✓ Seeded ${areasData.length} areas`);

    // Load and seed animal categories
    const categoriesData = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'data/animal-categories.json'), 'utf-8'),
    );
    console.log(`\nSeeding ${categoriesData.length} animal categories...`);
    for (const category of categoriesData) {
      await prisma.animalCategory.upsert({
        where: { code: category.code },
        update: {},
        create: category,
      });
    }
    console.log(`✓ Seeded ${categoriesData.length} animal categories`);

    // Load and seed animal types
    const typesData = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'data/animal-types.json'), 'utf-8'),
    );
    console.log(`\nSeeding ${typesData.length} animal types...`);
    for (const type of typesData) {
      await prisma.animalType.upsert({
        where: { name: type.name },
        update: {},
        create: type,
      });
    }
    console.log(`✓ Seeded ${typesData.length} animal types`);

    // Load and seed sizes
    const sizesData = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'data/animal-sizes.json'), 'utf-8'),
    );
    console.log(`\nSeeding ${sizesData.length} animal sizes...`);
    for (const size of sizesData) {
      await prisma.animalSize.upsert({
        where: { code: size.code },
        update: {},
        create: size,
      });
    }
    console.log(`✓ Seeded ${sizesData.length} animal sizes`);

    // Load and seed colors
    const colorsData = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'data/animal-colors.json'), 'utf-8'),
    );
    console.log(`\nSeeding ${colorsData.length} animal colors...`);
    for (const color of colorsData) {
      await prisma.animalColor.upsert({
        where: { code: color.code },
        update: {},
        create: color,
      });
    }
    console.log(`✓ Seeded ${colorsData.length} animal colors`);

    // Load and seed patterns
    const patternsData = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'data/coat-patterns.json'), 'utf-8'),
    );
    console.log(`\nSeeding ${patternsData.length} coat patterns...`);
    for (const pattern of patternsData) {
      await prisma.coatPattern.upsert({
        where: { code: pattern.code },
        update: {},
        create: pattern,
      });
    }
    console.log(`✓ Seeded ${patternsData.length} coat patterns`);

    // Load and seed breeds
    const breedsData = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'data/breeds.json'), 'utf-8'),
    );
    console.log(`\nSeeding ${breedsData.length} breeds...`);
    for (const breed of breedsData) {
      await prisma.breed.upsert({
        where: { name_animalTypeId: { name: breed.name, animalTypeId: breed.animalTypeId } },
        update: {},
        create: breed,
      });
    }
    console.log(`✓ Seeded ${breedsData.length} breeds`);

    console.log('\n✓ All reference data seeded successfully');
  } catch (error) {
    console.error('\n✗ Seeding failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

runSeed();
