-- Sketchpad session "groups" — link sibling sessions in a series of
-- identical classes (e.g., the same EMR Provider class delivered five
-- times). The UI shows "n/N" on each member so the planner can see at a
-- glance which session is which. Trainer / time / room can still be edited
-- per-session; group membership is sticky.
--
-- A null group_id means "standalone session, not part of a series."

alter table public.sketchpad_sessions
  add column if not exists group_id uuid;

create index if not exists sketchpad_sessions_group_idx
  on public.sketchpad_sessions (schedule_id, group_id)
  where group_id is not null;
