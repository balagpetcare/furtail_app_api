-- Additive-only migration: adds Bengali-name support and the two remaining
-- "safe non-specific choice" flags (isLocal, isUnknown — isMixed/isOther
-- already existed) to the existing animal taxonomy tables. No table is
-- dropped, renamed, or has data removed; every new column has a safe
-- DEFAULT so existing rows remain valid immediately.

-- AlterTable: animal_categories
ALTER TABLE "animal_categories" ADD COLUMN IF NOT EXISTS "nameBn" TEXT;

-- AlterTable: animal_types
ALTER TABLE "animal_types" ADD COLUMN IF NOT EXISTS "nameBn" TEXT;
DROP INDEX IF EXISTS "animal_types_categoryId_idx";
DROP INDEX IF EXISTS "animal_types_categoryId_isActive_displayOrder_idx";
CREATE INDEX "animal_types_categoryId_isActive_displayOrder_idx" ON "animal_types"("categoryId", "isActive", "displayOrder");

-- AlterTable: breeds
ALTER TABLE "breeds" ADD COLUMN IF NOT EXISTS "nameBn" TEXT;
ALTER TABLE "breeds" ADD COLUMN IF NOT EXISTS "isLocal" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "breeds" ADD COLUMN IF NOT EXISTS "isUnknown" BOOLEAN NOT NULL DEFAULT false;
DROP INDEX IF EXISTS "breeds_animalTypeId_idx";
DROP INDEX IF EXISTS "breeds_animalTypeId_isActive_displayOrder_idx";
CREATE INDEX "breeds_animalTypeId_isActive_displayOrder_idx" ON "breeds"("animalTypeId", "isActive", "displayOrder");
