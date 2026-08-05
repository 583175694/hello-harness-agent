-- AlterTable
ALTER TABLE "sessions" ADD COLUMN "is_pinned" BOOLEAN NOT NULL DEFAULT false;

-- ReplaceIndex
DROP INDEX "sessions_user_id_updated_at_idx";
CREATE INDEX "sessions_user_id_is_pinned_updated_at_idx" ON "sessions"("user_id", "is_pinned" DESC, "updated_at" DESC);
