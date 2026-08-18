CREATE TABLE "context_compaction_states" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "covered_message_count" INTEGER NOT NULL,
    "covered_through_item_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "token_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "context_compaction_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "context_compaction_states_session_id_key" ON "context_compaction_states"("session_id");

ALTER TABLE "context_compaction_states" ADD CONSTRAINT "context_compaction_states_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
