-- CreateEnum
CREATE TYPE "FileCleanupStatus" AS ENUM ('pending', 'completed', 'failed');

-- CreateTable
CREATE TABLE "file_cleanup_tasks" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "status" "FileCleanupStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "file_cleanup_tasks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "file_cleanup_tasks_session_id_file_id_key" ON "file_cleanup_tasks"("session_id", "file_id");
CREATE INDEX "file_cleanup_tasks_status_updated_at_idx" ON "file_cleanup_tasks"("status", "updated_at");
