CREATE TABLE "agent_run_tool_outputs" (
  "id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "tool_call_id" TEXT NOT NULL,
  "storage_key" TEXT NOT NULL,
  "content_type" TEXT NOT NULL,
  "byte_size" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "preview" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_run_tool_outputs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_run_tool_outputs_run_id_tool_call_id_key" ON "agent_run_tool_outputs"("run_id", "tool_call_id");
CREATE INDEX "agent_run_tool_outputs_run_id_created_at_idx" ON "agent_run_tool_outputs"("run_id", "created_at");
ALTER TABLE "agent_run_tool_outputs" ADD CONSTRAINT "agent_run_tool_outputs_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
