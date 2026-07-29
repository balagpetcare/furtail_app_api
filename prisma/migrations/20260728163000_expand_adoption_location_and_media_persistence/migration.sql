-- Additive migration: preserve existing adoption rows and media rows while
-- expanding the adoption hierarchy and persisting upload binding metadata.

ALTER TABLE "adoption_listings"
  ADD COLUMN IF NOT EXISTS "bdAddressMode" TEXT,
  ADD COLUMN IF NOT EXISTS "bdCityCorporationId" INTEGER,
  ADD COLUMN IF NOT EXISTS "bdZoneId" INTEGER,
  ADD COLUMN IF NOT EXISTS "bdWardId" INTEGER,
  ADD COLUMN IF NOT EXISTS "bdUnionId" INTEGER;

ALTER TABLE "Media"
  ADD COLUMN IF NOT EXISTS "purpose" TEXT NOT NULL DEFAULT 'generic',
  ADD COLUMN IF NOT EXISTS "contentType" TEXT,
  ADD COLUMN IF NOT EXISTS "contentId" TEXT,
  ADD COLUMN IF NOT EXISTS "uploadIdempotencyKey" TEXT;

CREATE INDEX IF NOT EXISTS "Media_contentType_contentId_idx" ON "Media"("contentType", "contentId");
CREATE UNIQUE INDEX IF NOT EXISTS "Media_ownerUserId_uploadIdempotencyKey_key" ON "Media"("ownerUserId", "uploadIdempotencyKey");
