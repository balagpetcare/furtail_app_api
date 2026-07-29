-- Additive-only migration: introduces the Country table (for stable
-- ISO-alpha-2 country resolution, e.g. "BD") and adds isActive/sortOrder
-- metadata to the existing Bangladesh location hierarchy so it can serve as
-- the single canonical location system for every module. No existing table
-- is dropped, renamed, or has data removed; all new columns are nullable-safe
-- via DEFAULT values so existing rows remain valid immediately.

-- CreateTable: Country
CREATE TABLE IF NOT EXISTS "countries" (
    "id" SERIAL NOT NULL,
    "iso2" VARCHAR(2) NOT NULL,
    "iso3" VARCHAR(3),
    "name" TEXT NOT NULL,
    "nameBn" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "countries_iso2_key" ON "countries"("iso2");
CREATE INDEX IF NOT EXISTS "countries_isActive_sortOrder_idx" ON "countries"("isActive", "sortOrder");

-- AlterTable: bd_divisions
ALTER TABLE "bd_divisions" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "bd_divisions" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
DROP INDEX IF EXISTS "bd_divisions_isActive_sortOrder_idx";
CREATE INDEX "bd_divisions_isActive_sortOrder_idx" ON "bd_divisions"("isActive", "sortOrder");

-- AlterTable: bd_districts
ALTER TABLE "bd_districts" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "bd_districts" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
DROP INDEX IF EXISTS "bd_districts_divisionId_idx";
DROP INDEX IF EXISTS "bd_districts_divisionId_isActive_sortOrder_idx";
CREATE INDEX "bd_districts_divisionId_isActive_sortOrder_idx" ON "bd_districts"("divisionId", "isActive", "sortOrder");

-- AlterTable: bd_upazilas
ALTER TABLE "bd_upazilas" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "bd_upazilas" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
DROP INDEX IF EXISTS "bd_upazilas_districtId_idx";
DROP INDEX IF EXISTS "bd_upazilas_districtId_isActive_sortOrder_idx";
CREATE INDEX "bd_upazilas_districtId_isActive_sortOrder_idx" ON "bd_upazilas"("districtId", "isActive", "sortOrder");

-- AlterTable: bd_unions
ALTER TABLE "bd_unions" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "bd_unions" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
DROP INDEX IF EXISTS "bd_unions_upazilaId_idx";
DROP INDEX IF EXISTS "bd_unions_upazilaId_isActive_sortOrder_idx";
CREATE INDEX "bd_unions_upazilaId_isActive_sortOrder_idx" ON "bd_unions"("upazilaId", "isActive", "sortOrder");

-- AlterTable: bd_areas
ALTER TABLE "bd_areas" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "bd_areas" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
DROP INDEX IF EXISTS "bd_areas_unionId_idx";
DROP INDEX IF EXISTS "bd_areas_upazilaId_idx";
DROP INDEX IF EXISTS "bd_areas_districtId_idx";
DROP INDEX IF EXISTS "bd_areas_type_idx";
DROP INDEX IF EXISTS "bd_areas_unionId_isActive_sortOrder_idx";
DROP INDEX IF EXISTS "bd_areas_upazilaId_isActive_sortOrder_idx";
DROP INDEX IF EXISTS "bd_areas_districtId_isActive_sortOrder_idx";
DROP INDEX IF EXISTS "bd_areas_parentId_isActive_sortOrder_idx";
DROP INDEX IF EXISTS "bd_areas_type_isActive_idx";
CREATE INDEX "bd_areas_unionId_isActive_sortOrder_idx" ON "bd_areas"("unionId", "isActive", "sortOrder");
CREATE INDEX "bd_areas_upazilaId_isActive_sortOrder_idx" ON "bd_areas"("upazilaId", "isActive", "sortOrder");
CREATE INDEX "bd_areas_districtId_isActive_sortOrder_idx" ON "bd_areas"("districtId", "isActive", "sortOrder");
CREATE INDEX "bd_areas_parentId_isActive_sortOrder_idx" ON "bd_areas"("parentId", "isActive", "sortOrder");
CREATE INDEX "bd_areas_type_isActive_idx" ON "bd_areas"("type", "isActive");
