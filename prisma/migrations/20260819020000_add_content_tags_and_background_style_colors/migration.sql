-- AlterTable: add structured gradient end color + required safe text color
-- to background_styles. Both are additive/nullable-or-defaulted so existing
-- rows (and the stable Flutter-shared keys they carry) are never touched.
ALTER TABLE "background_styles" ADD COLUMN "colorValueEnd" VARCHAR(32);
ALTER TABLE "background_styles" ADD COLUMN "textColor" VARCHAR(32) NOT NULL DEFAULT '#000000';

-- CreateTable: smallest proper Post <-> ContentTag join relation.
CREATE TABLE "PostContentTag" (
    "id" SERIAL NOT NULL,
    "postId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,

    CONSTRAINT "PostContentTag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PostContentTag_postId_idx" ON "PostContentTag"("postId");

-- CreateIndex
CREATE INDEX "PostContentTag_tagId_idx" ON "PostContentTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "PostContentTag_postId_tagId_key" ON "PostContentTag"("postId", "tagId");

-- AddForeignKey
ALTER TABLE "PostContentTag" ADD CONSTRAINT "PostContentTag_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostContentTag" ADD CONSTRAINT "PostContentTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "content_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
