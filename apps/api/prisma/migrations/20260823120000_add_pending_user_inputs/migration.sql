-- CreateEnum
CREATE TYPE "PendingUserInputKind" AS ENUM ('follow_up', 'steer');

-- CreateEnum
CREATE TYPE "PendingUserInputStatus" AS ENUM ('pending', 'consumed', 'rejected', 'cancelled');

CREATE TABLE "pending_user_inputs" (
  "id" TEXT NOT NULL,
  "session_id" TEXT NOT NULL,
  "kind" "PendingUserInputKind" NOT NULL,
  "status" "PendingUserInputStatus" NOT NULL DEFAULT 'pending',
  "content" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pending_user_inputs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "pending_user_inputs_session_id_idempotency_key_key" ON "pending_user_inputs"("session_id", "idempotency_key");
CREATE INDEX "pending_user_inputs_session_id_status_kind_sequence_idx" ON "pending_user_inputs"("session_id", "status", "kind", "sequence");
ALTER TABLE "pending_user_inputs" ADD CONSTRAINT "pending_user_inputs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
