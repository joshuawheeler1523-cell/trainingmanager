-- Add a per-impl schedule_mode so users can choose between the CSP solver
-- ('auto') and a hand-built schedule via the grid view ('manual'). Default
-- 'auto' preserves prior behavior for every existing impl.
--
-- The Calculate page reads this to decide which CTA to show; the Schedule
-- page reads it to decide whether to mount the session pool sidebar.

alter table public.implementations
  add column if not exists schedule_mode text not null default 'auto'
    check (schedule_mode in ('auto', 'manual'));
