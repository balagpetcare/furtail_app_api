-- Additive-only migration for Dhaka urban provenance classification.
-- This keeps legacy location rows readable while allowing the API and
-- Flutter selectors to distinguish current, historical, and review-only
-- records without dropping or remapping existing IDs.

ALTER TABLE "bd_areas" ADD COLUMN IF NOT EXISTS "reviewStatus" TEXT NOT NULL DEFAULT 'CURRENT_VERIFIED';
ALTER TABLE "bd_areas" ADD COLUMN IF NOT EXISTS "currentValidity" TEXT NOT NULL DEFAULT 'CURRENT_VERIFIED';
ALTER TABLE "bd_areas" ADD COLUMN IF NOT EXISTS "provenance" JSONB;
