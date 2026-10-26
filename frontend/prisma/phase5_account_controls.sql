-- NISAKSHI Phase 5 — additive account deletion tombstone schema.
-- Back up and test in staging before applying. Apply exactly once.
-- Do not run if AccountDeletionStatus or DeletedAccount already exists.
BEGIN;

CREATE TYPE "AccountDeletionStatus" AS ENUM ('PENDING', 'COMPLETE');

CREATE TABLE "DeletedAccount" (
    "id" TEXT NOT NULL,
    "emailHash" VARCHAR(64) NOT NULL,
    "status" "AccountDeletionStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeletedAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeletedAccount_emailHash_key" ON "DeletedAccount"("emailHash");
CREATE INDEX "DeletedAccount_status_expiresAt_idx"
    ON "DeletedAccount"("status", "expiresAt");

COMMIT;
