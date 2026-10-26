-- NISAKSHI Phase 4 — additive PostgreSQL schema change.
-- Review and apply ONCE against the existing schema after taking a database backup.
-- Existing project setup uses Prisma db push and has no prior migrations directory.
-- Do not run this if FileAsset/FileAssetStatus already exist; reconcile schema first.
BEGIN;

CREATE TYPE "FileAssetStatus" AS ENUM ('UPLOADING', 'READY', 'FAILED');

CREATE TABLE "FileAsset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" VARCHAR(64),
    "status" "FileAssetStatus" NOT NULL DEFAULT 'UPLOADING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FileAsset_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FileAsset_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "FileAsset_storageKey_key" ON "FileAsset"("storageKey");
CREATE INDEX "FileAsset_userId_createdAt_idx" ON "FileAsset"("userId", "createdAt");
CREATE INDEX "FileAsset_userId_status_idx" ON "FileAsset"("userId", "status");

COMMIT;
