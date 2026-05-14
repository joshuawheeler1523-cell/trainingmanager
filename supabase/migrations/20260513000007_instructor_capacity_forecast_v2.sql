-- Fix the 8-week capacity forecast: include every workload source that
-- v_instructor_workload pipes hours from, not just 3 of 6.
--
-- Bugs in the original (20251210000001_instructor_capacity_forecast.sql or
-- equivalent — whichever introduced this RPC):
--   1. Only summed classes + recurring + ad-hoc. Education requests,
--      project tasks, and training-planner sessions were silently dropped,
--      so the forecast under-reported load for anyone working on an active
--      impl rollout or special project.
--   2. Classes + recurring were spread evenly across 52 weeks — fine as an
--      annualized average, but blind to seasonality. Impl sessions and
--      project tasks have real dates we can bucket by; using them gives a
--      forecast that actually reflects what the next 8 weeks look like.
--
-- This version:
--   - Adds impl_sessions (training planner): bucket the session's duration
--     in hours into the ISO week of its scheduled_start. Only published
--     status counts.
--   - Adds project tasks: when tasks.start_date and tasks.end_date are
--     both set, spread allocated_hours evenly over the weeks the task
--     spans. When only end_date is set, place the full amount in that
--     week. When neither, the task is excluded (no signal to place it).
--   - Adds education_requests: place estimated_hours in the week of
--     target_completion_date; otherwise excluded.
--   - Keeps classes + recurring as annualized (no per-week dates exist
--     on those models) and ad-hoc tasks by due_date (unchanged).
--
-- The returned row shape is unchanged — column count, types, and order
-- all match the previous version, so the client doesn't need a redeploy
-- in lockstep.

create or replace function public.instructor_capacity_forecast(
  p_instructor_id uuid,
  p_start date,
  p_weeks integer default 8
)
returns table(
  week_start       date,
  projected_hours  numeric,
  weekly_capacity  numeric,
  utilization_pct  numeric
)
language sql
stable security definer
set search_path = ''
as $$
with
  weeks as (
    select gs::date as week_start
    from generate_series(p_start, p_start + (p_weeks - 1) * 7, interval '7 days') gs
  ),
  inst as (
    select annual_hours
    from public.instructors
    where id = p_instructor_id
  ),

  -- ── Annualized sources (no per-week dates available) ────────────────────
  -- Both compute total annual_hours from v_instructor_workload, divided
  -- by 52, then sprayed evenly across every week in the forecast.

  class_per_week as (
    select coalesce(sum(w.annual_hours), 0) / 52.0 as per_week
    from public.v_instructor_workload w
    where w.instructor_id = p_instructor_id
      and w.source = 'class'
  ),
  recurring_per_week as (
    select coalesce(sum(w.annual_hours), 0) / 52.0 as per_week
    from public.v_instructor_workload w
    where w.instructor_id = p_instructor_id
      and w.source = 'recurring_task'
  ),

  -- ── Date-aware sources ──────────────────────────────────────────────────
  -- Bucket by date_trunc('week', anchor)::date which yields Monday-start
  -- ISO weeks; matches the weeks CTE above.

  adhoc_by_week as (
    select
      date_trunc('week', aht.due_date)::date as week_start,
      sum(aht.hours)                          as hours
    from public.ad_hoc_tasks aht
    where aht.instructor_id = p_instructor_id
      and aht.status in ('open','in_progress')
      and aht.due_date is not null
    group by date_trunc('week', aht.due_date)::date
  ),

  -- Education requests: estimated_hours placed in week of
  -- target_completion_date. Status gate matches the workload view.
  edreq_by_week as (
    select
      date_trunc('week', er.target_completion_date)::date as week_start,
      sum(era.estimated_hours)                            as hours
    from public.education_request_assignments era
    join public.education_requests er on er.id = era.request_id
    where era.instructor_id = p_instructor_id
      and er.target_completion_date is not null
      and er.deleted_at is null
      and er.status in ('approved','assigned','in_progress')
    group by date_trunc('week', er.target_completion_date)::date
  ),

  -- Project tasks: if start_date and end_date both set, spread evenly
  -- over the (week_count) weeks they span; otherwise place full hours
  -- in the end_date week (or start_date week if end is missing).
  project_task_rows as (
    select
      ta.allocated_hours,
      t.start_date,
      t.end_date
    from public.task_assignments ta
    join public.project_team_members ptm on ptm.id = ta.project_team_member_id
    join public.tasks t on t.id = ta.task_id
    join public.projects p on p.id = t.project_id and p.deleted_at is null
    where ptm.instructor_id = p_instructor_id
      and p.status in ('planning','active')
      and t.status in ('not_started','in_progress')
  ),
  -- Expand each project task into one row per week it spans.
  project_task_expanded as (
    select
      week_start::date as week_start,
      (case
        when r.start_date is not null and r.end_date is not null
             and r.end_date >= r.start_date then
          r.allocated_hours / greatest(
            1,
            ceil(((r.end_date - r.start_date)::numeric + 1) / 7.0)
          )
        else r.allocated_hours
      end) as hours
    from project_task_rows r,
    lateral generate_series(
      date_trunc('week', coalesce(r.start_date, r.end_date)),
      date_trunc('week', coalesce(r.end_date, r.start_date)),
      interval '7 days'
    ) week_start
    where coalesce(r.start_date, r.end_date) is not null
  ),
  project_task_by_week as (
    select week_start, sum(hours) as hours
    from project_task_expanded
    group by week_start
  ),

  -- Training-planner sessions: bucket the session duration (hours) into
  -- the week of scheduled_start. Only published sessions count.
  impl_session_by_week as (
    select
      date_trunc('week', s.scheduled_start)::date as week_start,
      sum(extract(epoch from (s.scheduled_end - s.scheduled_start)) / 3600.0) as hours
    from public.impl_sessions s
    join public.impl_trainers it on it.id = s.impl_trainer_id
    where it.instructor_id = p_instructor_id
      and s.status = 'published'
    group by date_trunc('week', s.scheduled_start)::date
  )

select
  w.week_start,

  coalesce((select per_week from class_per_week), 0)
  + coalesce((select per_week from recurring_per_week), 0)
  + coalesce((select hours from adhoc_by_week        ah where ah.week_start = w.week_start), 0)
  + coalesce((select hours from edreq_by_week        er where er.week_start = w.week_start), 0)
  + coalesce((select hours from project_task_by_week pt where pt.week_start = w.week_start), 0)
  + coalesce((select hours from impl_session_by_week ims where ims.week_start = w.week_start), 0)
    as projected_hours,

  coalesce((select annual_hours from inst), 0) / 52.0 as weekly_capacity,

  case
    when (select annual_hours from inst) is null
      or (select annual_hours from inst) = 0 then null
    else (
      (
        coalesce((select per_week from class_per_week), 0)
        + coalesce((select per_week from recurring_per_week), 0)
        + coalesce((select hours from adhoc_by_week        ah where ah.week_start = w.week_start), 0)
        + coalesce((select hours from edreq_by_week        er where er.week_start = w.week_start), 0)
        + coalesce((select hours from project_task_by_week pt where pt.week_start = w.week_start), 0)
        + coalesce((select hours from impl_session_by_week ims where ims.week_start = w.week_start), 0)
      )
      / ((select annual_hours from inst) / 52.0)
    ) * 100
  end as utilization_pct
from weeks w
order by w.week_start;
$$;

revoke execute on function public.instructor_capacity_forecast(uuid, date, integer)
  from public, anon;
grant  execute on function public.instructor_capacity_forecast(uuid, date, integer)
  to authenticated;
