-- Bump sketchpad_schedules.day_count cap from 14 → 90.
--
-- 14 days was an arbitrary first-pass cap and proved too tight in practice
-- (a hospital-wide EMR rollout commonly spans 6–12 weeks). 90 covers a full
-- quarter, which is the longest realistic sketch window without crossing
-- into multi-quarter territory where a real Training Planner implementation
-- is the better tool.

alter table public.sketchpad_schedules
  drop constraint if exists sketchpad_schedules_day_count_check;

alter table public.sketchpad_schedules
  add constraint sketchpad_schedules_day_count_check
  check (day_count between 1 and 90);
