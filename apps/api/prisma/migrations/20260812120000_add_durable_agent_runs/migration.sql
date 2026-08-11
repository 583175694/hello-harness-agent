-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('queued', 'running', 'cancel_requested', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "AgentStepKind" AS ENUM ('model', 'tool');

-- CreateEnum
CREATE TYPE "AgentStepStatus" AS ENUM ('running', 'completed', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "input_message_id" TEXT NOT NULL,
    "assistant_message_id" TEXT NOT NULL,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'queued',
    "active_step_id" TEXT,
    "tool_call_count" INTEGER NOT NULL DEFAULT 0,
    "last_event_sequence" BIGINT NOT NULL DEFAULT 0,
    "owner_instance_id" TEXT,
    "heartbeat_at" TIMESTAMP(3),
    "error_code" TEXT,
    "error_detail" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_run_steps" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "kind" "AgentStepKind" NOT NULL,
    "status" "AgentStepStatus" NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "tool_call_id" TEXT,
    "tool_name" TEXT,
    "input" JSONB,
    "output" JSONB,
    "error_code" TEXT,
    "error_detail" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    CONSTRAINT "agent_run_steps_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "messages" ADD COLUMN "run_id" TEXT;

-- Indexes
CREATE UNIQUE INDEX "agent_runs_session_id_idempotency_key_key" ON "agent_runs"("session_id", "idempotency_key");
CREATE INDEX "agent_runs_session_id_status_idx" ON "agent_runs"("session_id", "status");
CREATE UNIQUE INDEX "agent_runs_one_active_per_session" ON "agent_runs"("session_id") WHERE "status" IN ('queued', 'running', 'cancel_requested');
CREATE UNIQUE INDEX "agent_run_steps_run_id_sequence_key" ON "agent_run_steps"("run_id", "sequence");
CREATE INDEX "messages_run_id_idx" ON "messages"("run_id");

-- ForeignKeys
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_run_steps" ADD CONSTRAINT "agent_run_steps_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
