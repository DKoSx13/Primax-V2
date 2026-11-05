-- Preserve historical shifts and enablements for existing operations.
-- New operations bind directly to the terminal/pump assignment.
ALTER TABLE "TerminalOperation" ALTER COLUMN "enablementId" DROP NOT NULL;
ALTER TABLE "Terminal" ADD COLUMN "suspensionReason" VARCHAR(500);
ALTER TABLE "Terminal" ADD COLUMN "statusChangedByUserId" UUID;
ALTER TABLE "Terminal" ADD COLUMN "statusChangedAt" TIMESTAMPTZ(3);
ALTER TABLE "Terminal" ADD CONSTRAINT "Terminal_statusChangedByUserId_fkey"
  FOREIGN KEY ("statusChangedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
