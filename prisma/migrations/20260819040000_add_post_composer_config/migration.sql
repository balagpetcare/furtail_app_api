-- CreateTable: singleton (id always 1) canonical Create Post composer
-- configuration (max caption length, max background-eligible caption
-- length) — see the PostComposerConfig model doc comment in schema.prisma.
CREATE TABLE "post_composer_config" (
    "id" INTEGER NOT NULL,
    "maxCaptionCharacters" INTEGER NOT NULL DEFAULT 5000,
    "maxBackgroundCaptionCharacters" INTEGER NOT NULL DEFAULT 300,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "post_composer_config_pkey" PRIMARY KEY ("id")
);
