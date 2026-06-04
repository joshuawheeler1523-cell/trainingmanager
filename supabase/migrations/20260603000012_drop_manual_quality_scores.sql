-- =============================================================================
-- Drop the manual instructor quality scores table.
-- =============================================================================
-- Instructor quality is now 100% automatic from the anonymous QR survey — no
-- manager hand-enters anything. The manual L2–L4 "outcomes log" is removed from
-- the product, so its table (and triggers) go too. Nothing else depends on it.
-- =============================================================================

drop table if exists public.instructor_quality_scores;
