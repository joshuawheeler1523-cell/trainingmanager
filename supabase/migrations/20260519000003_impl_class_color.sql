-- Add an optional color override to impl_classes. The schedule view falls
-- back to the deterministic hash-based palette when this is null, so old
-- rows keep their current colors and new ones can be re-skinned ad-hoc.
--
-- Format: hex string like "#abcdef". Stored as text rather than a tighter
-- domain so users can paste any valid CSS color if they want (rgb(), hsl())
-- — the schedule view passes the value straight through to a CSS
-- background-color.

alter table public.impl_classes
  add column color text;
