ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "normalized_key" TEXT;
ALTER TABLE "files" DROP COLUMN IF EXISTS "normalized_content";
ALTER TABLE "files" DROP COLUMN IF EXISTS "locations";
