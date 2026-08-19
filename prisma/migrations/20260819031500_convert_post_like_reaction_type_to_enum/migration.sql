-- CreateEnum
CREATE TYPE "ReactionType" AS ENUM ('LIKE', 'LOVE', 'AWW', 'HAHA', 'WOW', 'SAD', 'ANGRY');

-- AlterTable: convert PostLike.reactionType from varchar(255) to the
-- ReactionType enum. All 8 existing rows are 'LIKE' (verified via direct
-- query), which maps cleanly onto the enum, so this is a safe in-place
-- cast with no data loss.
ALTER TABLE "PostLike" ALTER COLUMN "reactionType" DROP DEFAULT;
ALTER TABLE "PostLike" ALTER COLUMN "reactionType" TYPE "ReactionType" USING ("reactionType"::"ReactionType");
ALTER TABLE "PostLike" ALTER COLUMN "reactionType" SET DEFAULT 'LIKE';
