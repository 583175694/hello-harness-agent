DROP INDEX IF EXISTS "reports_run_id_key";
CREATE INDEX "reports_run_id_idx" ON "reports"("run_id");
