-- Refire the conflict trigger on every existing session. The previous
-- migration installed the cross-impl-stripped trigger function, but the
-- trigger is set to UPDATE OF (status, scheduled_*, impl_*) — so a plain
-- `set id = id` does NOT fire it. Bumping status (no-op semantically)
-- causes the trigger to recompute conflict_status with the new logic,
-- clearing cross-impl flags from old data.

update public.impl_sessions set status = status;
