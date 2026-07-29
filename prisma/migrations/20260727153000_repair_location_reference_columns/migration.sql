-- Repair migration for local development databases that are missing the
-- additive Bangladesh location metadata columns expected by the committed
-- Prisma schema and runtime queries.
--
-- The migration is intentionally idempotent so it is safe to deploy on top of
-- partially migrated databases without duplicating data or dropping anything.

ALTER TABLE "bd_divisions" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "bd_divisions" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
DROP INDEX IF EXISTS "bd_divisions_isActive_sortOrder_idx";
CREATE INDEX "bd_divisions_isActive_sortOrder_idx" ON "bd_divisions"("isActive", "sortOrder");

ALTER TABLE "bd_districts" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "bd_districts" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
DROP INDEX IF EXISTS "bd_districts_divisionId_isActive_sortOrder_idx";
CREATE INDEX "bd_districts_divisionId_isActive_sortOrder_idx" ON "bd_districts"("divisionId", "isActive", "sortOrder");

ALTER TABLE "bd_upazilas" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "bd_upazilas" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
DROP INDEX IF EXISTS "bd_upazilas_districtId_isActive_sortOrder_idx";
CREATE INDEX "bd_upazilas_districtId_isActive_sortOrder_idx" ON "bd_upazilas"("districtId", "isActive", "sortOrder");

ALTER TABLE "bd_unions" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "bd_unions" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
DROP INDEX IF EXISTS "bd_unions_upazilaId_isActive_sortOrder_idx";
CREATE INDEX "bd_unions_upazilaId_isActive_sortOrder_idx" ON "bd_unions"("upazilaId", "isActive", "sortOrder");

ALTER TABLE "bd_areas" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "bd_areas" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
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
