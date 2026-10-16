ALTER TABLE "user_memory_settings"
  ADD COLUMN IF NOT EXISTS "allow_agent_write" BOOLEAN;

DO $$
BEGIN
  -- Older deployments used extraction_enabled; fresh installs do not have it.
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'user_memory_settings'
      AND column_name = 'extraction_enabled'
  ) THEN
    EXECUTE 'UPDATE "user_memory_settings" SET "allow_agent_write" = COALESCE("extraction_enabled", true) WHERE "allow_agent_write" IS NULL';
  ELSE
    UPDATE "user_memory_settings"
    SET "allow_agent_write" = true
    WHERE "allow_agent_write" IS NULL;
  END IF;
END $$;

ALTER TABLE "user_memory_settings"
  ALTER COLUMN "allow_agent_write" SET DEFAULT true;

UPDATE "user_memory_settings"
SET "allow_agent_write" = true
WHERE "allow_agent_write" IS NULL;

ALTER TABLE "user_memory_settings"
  ALTER COLUMN "allow_agent_write" SET NOT NULL;
