-- Align persisted compaction boundary with transcript units (CE P0).
ALTER TABLE "context_compaction_states" ADD COLUMN "covered_unit_count" INTEGER;
