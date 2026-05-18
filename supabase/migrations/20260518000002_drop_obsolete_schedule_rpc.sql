-- Drop the legacy pl/pgSQL scheduler RPCs. Both were superseded by the
-- in-process CSP solver (apps/web/src/lib/training-planner/schedule-solver.ts),
-- and find_alternative_slots was only consumed by the conflicts resolver
-- which was deleted when anchor mode + cross-impl coordination went away
-- (single-project scheduling).
--
-- Safe to drop because:
--   1. No application code calls these RPCs anymore. The web app's
--      database.types.ts will still list them until regenerated, but no
--      TS code invokes supabase.rpc('generate_implementation_schedule') or
--      supabase.rpc('find_alternative_slots').
--   2. The only test fixture referencing them
--      (scripts/verify-dual-care-schedule.ts) is a one-off post-fix
--      verification that already served its purpose and is being deleted
--      alongside this migration.
--   3. No DB trigger, view, or other function depends on them
--      (verified via pg_depend; only the previous CREATE OR REPLACE
--      migrations show up).

drop function if exists public.generate_implementation_schedule(uuid, boolean, uuid[]);
drop function if exists public.find_alternative_slots(uuid, integer);
