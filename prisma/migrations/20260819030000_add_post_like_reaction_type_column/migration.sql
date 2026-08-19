-- Retroactively tracks a column that was already applied to the local dev
-- database via `prisma db push` during in-progress reaction-feature work,
-- before this migration file existed. Verified via direct psql inspection
-- that the live "PostLike"."reactionType" column already exactly matches
-- this DDL (varchar(255) NOT NULL DEFAULT 'LIKE'), so this migration is
-- resolved as --applied rather than executed, to avoid a duplicate-column
-- error. See the follow-up migration for the varchar -> enum conversion.
ALTER TABLE "PostLike" ADD COLUMN "reactionType" VARCHAR(255) NOT NULL DEFAULT 'LIKE';
