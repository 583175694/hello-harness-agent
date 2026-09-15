CREATE TYPE "ReportQuality" AS ENUM ('standard', 'limited');
CREATE TYPE "ReportStatus" AS ENUM ('ready', 'deleted');
CREATE TABLE "reports" (
 "id" TEXT NOT NULL, "artifact_id" TEXT NOT NULL, "run_id" TEXT NOT NULL, "user_id" TEXT NOT NULL, "session_id" TEXT NOT NULL,
 "title" TEXT NOT NULL, "summary" TEXT NOT NULL, "quality" "ReportQuality" NOT NULL, "limitation_note" TEXT,
 "source_ids" JSONB NOT NULL, "file_ids" JSONB NOT NULL, "status" "ReportStatus" NOT NULL DEFAULT 'ready',
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "reports_artifact_id_key" ON "reports"("artifact_id");
CREATE UNIQUE INDEX "reports_run_id_key" ON "reports"("run_id");
CREATE INDEX "reports_session_id_idx" ON "reports"("session_id");
ALTER TABLE "reports" ADD CONSTRAINT "reports_artifact_id_fkey" FOREIGN KEY ("artifact_id") REFERENCES "artifacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reports" ADD CONSTRAINT "reports_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reports" ADD CONSTRAINT "reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reports" ADD CONSTRAINT "reports_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
