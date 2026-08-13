-- This migration intentionally contains no legacy-data cleanup. Run the temporary
-- cutover reset command before applying it to databases containing old sessions.
ALTER TABLE "agent_runs"
  ADD COLUMN "provider" TEXT NOT NULL,
  ADD COLUMN "model" TEXT NOT NULL,
  ADD COLUMN "reasoning_effort" TEXT NOT NULL,
  ADD COLUMN "reasoning_format" TEXT;

CREATE TYPE "TranscriptItemKind" AS ENUM ('user', 'assistant', 'tool_result');
CREATE TYPE "TranscriptItemState" AS ENUM ('active', 'committed');

CREATE TABLE "model_transcript_items" (
  "id" TEXT NOT NULL,
  "session_id" TEXT NOT NULL,
  "run_id" TEXT,
  "message_id" TEXT,
  "sequence" INTEGER NOT NULL,
  "run_sequence" INTEGER NOT NULL,
  "kind" "TranscriptItemKind" NOT NULL,
  "state" "TranscriptItemState" NOT NULL DEFAULT 'active',
  "content" TEXT,
  "reasoning" TEXT,
  "tool_calls" JSONB,
  "tool_call_id" TEXT,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "reasoning_effort" TEXT NOT NULL,
  "reasoning_format" TEXT,
  "schema_version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "model_transcript_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "model_transcript_items_session_id_sequence_key" ON "model_transcript_items"("session_id", "sequence");
CREATE UNIQUE INDEX "model_transcript_items_run_id_run_sequence_key" ON "model_transcript_items"("run_id", "run_sequence");
CREATE INDEX "model_transcript_items_session_id_state_sequence_idx" ON "model_transcript_items"("session_id", "state", "sequence");
CREATE INDEX "model_transcript_items_message_id_idx" ON "model_transcript_items"("message_id");

ALTER TABLE "model_transcript_items" ADD CONSTRAINT "model_transcript_items_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "model_transcript_items" ADD CONSTRAINT "model_transcript_items_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "model_transcript_items" ADD CONSTRAINT "model_transcript_items_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
