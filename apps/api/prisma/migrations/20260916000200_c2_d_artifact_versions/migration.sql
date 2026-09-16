-- CreateEnum
CREATE TYPE "ArtifactOperation" AS ENUM ('create', 'revise', 'restore');

-- CreateTable
CREATE TABLE "artifact_series" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "logical_name" TEXT NOT NULL,
    "current_artifact_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "artifact_series_pkey" PRIMARY KEY ("id")
);

-- AlterTable: add nullable columns so existing C2-A/C artifacts can be backfilled.
ALTER TABLE "artifacts"
ADD COLUMN "series_id" TEXT,
ADD COLUMN "version_number" INTEGER,
ADD COLUMN "parent_artifact_id" TEXT,
ADD COLUMN "source_artifact_id" TEXT,
ADD COLUMN "operation" "ArtifactOperation" NOT NULL DEFAULT 'create',
ADD COLUMN "change_summary" TEXT;

-- Every legacy artifact becomes the immutable v1 of its own series.
INSERT INTO "artifact_series" (
    "id", "user_id", "session_id", "logical_name", "current_artifact_id", "created_at", "updated_at"
)
SELECT
    'series-' || a."id",
    a."user_id",
    a."session_id",
    f."file_name",
    CASE WHEN a."status" = 'ready' THEN a."id" ELSE NULL END,
    a."created_at",
    a."updated_at"
FROM "artifacts" a
JOIN "files" f ON f."id" = a."file_id";

UPDATE "artifacts"
SET "series_id" = 'series-' || "id", "version_number" = 1;

ALTER TABLE "artifacts" ALTER COLUMN "series_id" SET NOT NULL;
ALTER TABLE "artifacts" ALTER COLUMN "version_number" SET NOT NULL;

-- Indexes and constraints
CREATE UNIQUE INDEX "artifact_series_current_artifact_id_key" ON "artifact_series"("current_artifact_id");
CREATE INDEX "artifact_series_session_id_updated_at_idx" ON "artifact_series"("session_id", "updated_at" DESC);
CREATE UNIQUE INDEX "artifacts_series_id_version_number_key" ON "artifacts"("series_id", "version_number");
CREATE INDEX "artifacts_series_id_created_at_idx" ON "artifacts"("series_id", "created_at");

ALTER TABLE "artifact_series" ADD CONSTRAINT "artifact_series_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "artifact_series" ADD CONSTRAINT "artifact_series_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "artifact_series"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_parent_artifact_id_fkey" FOREIGN KEY ("parent_artifact_id") REFERENCES "artifacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_source_artifact_id_fkey" FOREIGN KEY ("source_artifact_id") REFERENCES "artifacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "artifact_series" ADD CONSTRAINT "artifact_series_current_artifact_id_fkey" FOREIGN KEY ("current_artifact_id") REFERENCES "artifacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
