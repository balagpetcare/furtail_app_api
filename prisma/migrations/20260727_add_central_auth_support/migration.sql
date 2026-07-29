-- Add Central Auth support tables

-- Create UserCentralAuthLink table
CREATE TABLE "UserCentralAuthLink" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "linkMethod" TEXT NOT NULL DEFAULT 'direct',

    CONSTRAINT "UserCentralAuthLink_pkey" PRIMARY KEY ("id")
);

-- Add unique constraints for UserCentralAuthLink
CREATE UNIQUE INDEX "UserCentralAuthLink_userId_key" ON "UserCentralAuthLink"("userId");
CREATE UNIQUE INDEX "UserCentralAuthLink_subject_key" ON "UserCentralAuthLink"("subject");
CREATE INDEX "UserCentralAuthLink_subject_idx" ON "UserCentralAuthLink"("subject");

-- Create UserAuth table
CREATE TABLE "UserAuth" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'LOCAL',
    "emailVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAuth_pkey" PRIMARY KEY ("id")
);

-- Add unique constraints for UserAuth
CREATE UNIQUE INDEX "UserAuth_email_key" ON "UserAuth"("email");
CREATE UNIQUE INDEX "UserAuth_userId_provider_key" ON "UserAuth"("userId", "provider");
CREATE INDEX "UserAuth_email_idx" ON "UserAuth"("email");
CREATE INDEX "UserAuth_phone_idx" ON "UserAuth"("phone");

-- Add foreign key constraints
ALTER TABLE "UserCentralAuthLink" ADD CONSTRAINT "UserCentralAuthLink_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
