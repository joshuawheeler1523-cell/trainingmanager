-- Fix: find_alternative_slots was declared STABLE but the function body
-- creates and drops temp tables (pg_temp.tmp_alt_busy_room,
-- tmp_alt_busy_trainer, tmp_alt_candidates) — DDL is not allowed in a
-- STABLE function. Postgres errors at call time with:
--   "DROP TABLE is not allowed in a non-volatile function"
--
-- Symptom: opening the conflict resolver (Move this session drawer)
-- shows "No alternative slots" + a red toast with the DROP TABLE error.
-- Resolver is unusable.
--
-- The function genuinely has side effects (the temp tables) — STABLE
-- was an incorrect labeling. Switch to VOLATILE, the proper designation
-- for a function that performs DDL or has any non-readonly behavior.
-- The function is still SECURITY DEFINER and the existing grants are
-- preserved by ALTER FUNCTION.

alter function public.find_alternative_slots(uuid, int) volatile;
