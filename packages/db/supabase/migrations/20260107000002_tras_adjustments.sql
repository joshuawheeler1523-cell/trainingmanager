-- Step 3 of the TRA wizard captures free-form notes / assumptions used to
-- arrive at the final estimate. Stored separately from `description` (which
-- belongs to step 1, project info) so the two don't conflict.

alter table public.tras
  add column adjustments_notes text;
