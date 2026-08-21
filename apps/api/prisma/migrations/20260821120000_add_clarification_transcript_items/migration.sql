ALTER TYPE "TranscriptItemKind" ADD VALUE IF NOT EXISTS 'clarification_request';
ALTER TYPE "TranscriptItemKind" ADD VALUE IF NOT EXISTS 'clarification_response';

ALTER TABLE "model_transcript_items" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
