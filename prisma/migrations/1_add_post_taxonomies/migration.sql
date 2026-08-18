-- CreateTable post_feelings
CREATE TABLE "post_feelings" (
    "id" SERIAL NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "label" VARCHAR(160) NOT NULL,
    "emoji" VARCHAR(8) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "post_feelings_pkey" PRIMARY KEY ("id")
);

-- CreateTable post_activities
CREATE TABLE "post_activities" (
    "id" SERIAL NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "label" VARCHAR(160) NOT NULL,
    "emoji" VARCHAR(8) NOT NULL,
    "category" VARCHAR(64) NOT NULL DEFAULT 'General',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "post_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable post_category_taxonomies
CREATE TABLE "post_category_taxonomies" (
    "id" SERIAL NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "label" VARCHAR(160) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "post_category_taxonomies_pkey" PRIMARY KEY ("id")
);

-- CreateTable content_tags
CREATE TABLE "content_tags" (
    "id" SERIAL NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "label" VARCHAR(160) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable background_styles
CREATE TABLE "background_styles" (
    "id" SERIAL NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "label" VARCHAR(160) NOT NULL,
    "styleType" VARCHAR(32) NOT NULL DEFAULT 'solid',
    "colorValue" VARCHAR(32),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "background_styles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "post_feelings_key_key" ON "post_feelings"("key");

-- CreateIndex
CREATE INDEX "post_feelings_isActive_sortOrder_idx" ON "post_feelings"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "post_activities_key_key" ON "post_activities"("key");

-- CreateIndex
CREATE INDEX "post_activities_isActive_sortOrder_category_idx" ON "post_activities"("isActive", "sortOrder", "category");

-- CreateIndex
CREATE UNIQUE INDEX "post_category_taxonomies_key_key" ON "post_category_taxonomies"("key");

-- CreateIndex
CREATE INDEX "post_category_taxonomies_isActive_sortOrder_idx" ON "post_category_taxonomies"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "content_tags_key_key" ON "content_tags"("key");

-- CreateIndex
CREATE INDEX "content_tags_isActive_sortOrder_idx" ON "content_tags"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "background_styles_key_key" ON "background_styles"("key");

-- CreateIndex
CREATE INDEX "background_styles_isActive_sortOrder_idx" ON "background_styles"("isActive", "sortOrder");
