-- Hand-curated from `prisma migrate diff` output (not via `prisma migrate
-- dev`, which requires a shadow database this environment's DB user cannot
-- create — P3014 — and which would additionally have picked up unrelated
-- pre-existing schema drift on this database from other in-progress,
-- unreviewed work: dropping Friendship/Message/Notification/stories/media
-- variant tables that already exist in this dev database from separate
-- uncommitted migrations. None of that is touched here). This migration is
-- additive only: one nullable column + unique constraint on Post for
-- create-idempotency, and one new join table for tagged pets.

-- AlterTable: durable per-(author, key) idempotency for POST /api/v1/posts.
-- Nullable with no default — existing rows get NULL, which Postgres treats
-- as distinct for the purposes of the unique index below, so no backfill
-- is required and legacy requests without a key are never deduplicated
-- against each other.
ALTER TABLE "Post" ADD COLUMN "createIdempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Post_authorId_createIdempotencyKey_key" ON "Post"("authorId", "createIdempotencyKey");

-- CreateTable: persists SocialPostUpsertInput.taggedPetIds, which had no
-- persistent representation before this migration.
CREATE TABLE "PostTaggedPet" (
    "id" SERIAL NOT NULL,
    "postId" INTEGER NOT NULL,
    "petId" INTEGER NOT NULL,

    CONSTRAINT "PostTaggedPet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PostTaggedPet_petId_idx" ON "PostTaggedPet"("petId");

-- CreateIndex
CREATE UNIQUE INDEX "PostTaggedPet_postId_petId_key" ON "PostTaggedPet"("postId", "petId");

-- AddForeignKey
ALTER TABLE "PostTaggedPet" ADD CONSTRAINT "PostTaggedPet_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostTaggedPet" ADD CONSTRAINT "PostTaggedPet_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
