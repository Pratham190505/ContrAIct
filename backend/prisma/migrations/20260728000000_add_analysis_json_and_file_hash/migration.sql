ALTER TABLE "contracts" ADD COLUMN "analysisJson" JSONB;
ALTER TABLE "contracts" ADD COLUMN "fileHash" TEXT;

CREATE UNIQUE INDEX "contracts_userId_fileHash_key" ON "contracts"("userId", "fileHash");
