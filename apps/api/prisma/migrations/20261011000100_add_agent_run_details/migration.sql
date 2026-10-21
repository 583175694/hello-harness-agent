CREATE TABLE "agent_run_details" (
    "id" TEXT NOT NULL,
    "run_id" TEXT,
    "message_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "research_projection" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_run_details_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_run_details_run_id_key" ON "agent_run_details"("run_id");
CREATE UNIQUE INDEX "agent_run_details_message_id_key" ON "agent_run_details"("message_id");
CREATE INDEX "agent_run_details_session_id_updated_at_idx" ON "agent_run_details"("session_id", "updated_at");

ALTER TABLE "agent_run_details" ADD CONSTRAINT "agent_run_details_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_run_details" ADD CONSTRAINT "agent_run_details_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_run_details" ADD CONSTRAINT "agent_run_details_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
