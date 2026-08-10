-- Hand-curated from `prisma migrate diff` output (not via `prisma migrate
-- dev`, which would require a destructive `prisma migrate reset` due to
-- pre-existing, unrelated schema drift on wallet FKs / pet table
-- `updatedAt` defaults / index renames — none of that is touched here).
-- This migration is additive only: one new enum, one new UserProfile
-- privacy/discoverability column set (all with safe non-breaking
-- defaults), and two new mute/restrict tables.

-- CreateEnum
CREATE TYPE "InteractionSetting" AS ENUM ('EVERYONE', 'FOLLOWERS', 'NOBODY');

-- AlterTable: UserProfile privacy/discoverability/interaction fields.
-- Every new column has a safe, non-breaking default so existing rows are
-- valid immediately (no backfill required). showEmail's default changes
-- from true to false — see the showEmail default-flip note below.
ALTER TABLE "UserProfile"
  ADD COLUMN "defaultPostAudience" "PostPrivacy" NOT NULL DEFAULT 'PUBLIC',
  ADD COLUMN "discoverableByEmail" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "discoverableByPhone" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "discoverableBySearch" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "followersVisibility" "ProfileVisibility" NOT NULL DEFAULT 'PUBLIC',
  ADD COLUMN "followingVisibility" "ProfileVisibility" NOT NULL DEFAULT 'PUBLIC',
  ADD COLUMN "notificationPreferences" JSONB,
  ADD COLUMN "requiresProfilePostReview" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "requiresTagReview" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "showActivityStatus" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "showReadReceipts" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "whoCanComment" "InteractionSetting" NOT NULL DEFAULT 'EVERYONE',
  ADD COLUMN "whoCanFollow" "InteractionSetting" NOT NULL DEFAULT 'EVERYONE',
  ADD COLUMN "whoCanMention" "InteractionSetting" NOT NULL DEFAULT 'EVERYONE',
  ADD COLUMN "whoCanMessage" "InteractionSetting" NOT NULL DEFAULT 'EVERYONE',
  ADD COLUMN "whoCanTag" "InteractionSetting" NOT NULL DEFAULT 'EVERYONE';

-- showEmail's column default flips from true to false going forward — this
-- only changes the default applied to FUTURE inserts that omit the column;
-- it does not retroactively change any existing row's stored value (a
-- privacy-safer default for accounts created after this migration).
ALTER TABLE "UserProfile" ALTER COLUMN "showEmail" SET DEFAULT false;

-- CreateTable
CREATE TABLE "UserMute" (
    "id" SERIAL NOT NULL,
    "muterId" INTEGER NOT NULL,
    "mutedUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserMute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRestrict" (
    "id" SERIAL NOT NULL,
    "restricterId" INTEGER NOT NULL,
    "restrictedUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRestrict_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserMute_mutedUserId_createdAt_idx" ON "UserMute"("mutedUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserMute_muterId_mutedUserId_key" ON "UserMute"("muterId", "mutedUserId");

-- CreateIndex
CREATE INDEX "UserRestrict_restrictedUserId_createdAt_idx" ON "UserRestrict"("restrictedUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserRestrict_restricterId_restrictedUserId_key" ON "UserRestrict"("restricterId", "restrictedUserId");

-- AddForeignKey
ALTER TABLE "UserMute" ADD CONSTRAINT "UserMute_mutedUserId_fkey" FOREIGN KEY ("mutedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMute" ADD CONSTRAINT "UserMute_muterId_fkey" FOREIGN KEY ("muterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRestrict" ADD CONSTRAINT "UserRestrict_restrictedUserId_fkey" FOREIGN KEY ("restrictedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRestrict" ADD CONSTRAINT "UserRestrict_restricterId_fkey" FOREIGN KEY ("restricterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex (pre-existing app-level uniqueness requirement for payment
-- attempt dedup by provider; needed by fundraising-store.ts's idempotent
-- webhook handling, already relied upon by fundraising.integration.test.ts)
CREATE UNIQUE INDEX IF NOT EXISTS "fundraising_payment_attempts_provider_providerPaymentId_key" ON "fundraising_payment_attempts"("provider", "providerPaymentId");
