CREATE TYPE "FileOrigin" AS ENUM ('user_uploaded', 'agent_generated');
CREATE TYPE "ArtifactStatus" AS ENUM ('processing', 'ready', 'failed', 'deleted');
ALTER TABLE "files" ADD COLUMN "origin" "FileOrigin" NOT NULL DEFAULT 'user_uploaded';
CREATE TABLE "artifacts" (
  "id" TEXT NOT NULL,
  "file_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "session_id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "tool_call_id" TEXT NOT NULL,
  "status" "ArtifactStatus" NOT NULL DEFAULT 'processing',
  "error_code" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "artifacts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "artifacts_file_id_key" ON "artifacts"("file_id");
CREATE UNIQUE INDEX "artifacts_run_id_tool_call_id_key" ON "artifacts"("run_id", "tool_call_id");
CREATE INDEX "artifacts_session_id_idx" ON "artifacts"("session_id");
CREATE INDEX "artifacts_run_id_idx" ON "artifacts"("run_id");
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
