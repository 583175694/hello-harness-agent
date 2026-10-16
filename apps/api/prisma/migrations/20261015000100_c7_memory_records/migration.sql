-- pgvector 列维度须与 MEMORY_EMBEDDING_DIMENSIONS / PGVECTOR_COLUMN_DIMENSIONS (2560) 一致。
-- CreateTable
CREATE TABLE IF NOT EXISTS "memory_records" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "freshness" TEXT NOT NULL DEFAULT 'fresh',
    "importance" TEXT NOT NULL DEFAULT 'medium',
    "sensitivity" TEXT NOT NULL DEFAULT 'normal',
    "source_refs" JSONB NOT NULL,
    "policy" JSONB NOT NULL DEFAULT '{}',
    "provenance" JSONB NOT NULL,
    "supersedes_memory_id" TEXT,
    "embedding_model" TEXT,
    "embedded_at" TIMESTAMPTZ,
    "embedding_json" JSONB,
    "last_used_at" TIMESTAMPTZ,
    "use_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "expires_at" TIMESTAMPTZ,

    CONSTRAINT "memory_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "user_memory_settings" (
    "user_id" TEXT NOT NULL,
    "allow_agent_write" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_memory_settings_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "memory_records_user_id_status_idx" ON "memory_records"("user_id", "status");

DO $$ BEGIN
  ALTER TABLE "memory_records" ADD CONSTRAINT "memory_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "user_memory_settings" ADD CONSTRAINT "user_memory_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "memory_records" ADD COLUMN IF NOT EXISTS "embedding" vector(2560);
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;
