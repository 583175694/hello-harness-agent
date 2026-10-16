ALTER TABLE "memory_records" ADD COLUMN IF NOT EXISTS "provenance" JSONB;

UPDATE "memory_records"
SET "provenance" = COALESCE("provenance", '{}'::jsonb)
WHERE "provenance" IS NULL;

ALTER TABLE "memory_records" ALTER COLUMN "provenance" SET DEFAULT '{}'::jsonb;

DO $$ BEGIN
  ALTER TABLE "memory_records" ALTER COLUMN "provenance" SET NOT NULL;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;
