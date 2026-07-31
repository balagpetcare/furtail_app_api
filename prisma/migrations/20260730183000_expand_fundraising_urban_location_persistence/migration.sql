-- Add nullable urban Bangladesh fundraiser location columns to the
-- campaign and draft tables. This is an additive, non-destructive
-- migration that preserves existing fundraising data.

ALTER TABLE "fundraising_campaign_drafts"
  ADD COLUMN IF NOT EXISTS "bdAddressMode" TEXT,
  ADD COLUMN IF NOT EXISTS "bdCityCorporationId" INTEGER,
  ADD COLUMN IF NOT EXISTS "bdZoneId" INTEGER,
  ADD COLUMN IF NOT EXISTS "bdWardId" INTEGER,
  ADD COLUMN IF NOT EXISTS "bdUnionId" INTEGER;

ALTER TABLE "fundraising_campaigns"
  ADD COLUMN IF NOT EXISTS "bdAddressMode" TEXT,
  ADD COLUMN IF NOT EXISTS "bdCityCorporationId" INTEGER,
  ADD COLUMN IF NOT EXISTS "bdZoneId" INTEGER,
  ADD COLUMN IF NOT EXISTS "bdWardId" INTEGER,
  ADD COLUMN IF NOT EXISTS "bdUnionId" INTEGER;
