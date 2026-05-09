-- ── v_instructor_workload ────────────────────────────────────────────────────
-- Single source-of-truth view that unions every place an instructor's hours
-- can come from. One row per (instructor_id, source, source_id) with the
-- annual-hour contribution and the bucket those hours roll up to.
--
-- Sources covered today (Phase 3):
--   1. class                — class_instructor_assignments × classes
--   2. recurring_task       — recurring_tasks × recurring_task_assignments
--   3. ad_hoc_task          — ad_hoc_tasks (open + in_progress only)
--
-- Sources to be added by future phases (CREATE OR REPLACE VIEW):
--   4. project              — project_team_members × projects (Phase 9)
--   5. project_task         — task_assignments × tasks × projects (Phase 9)
--   6. education_request    — education_request_assignments × education_requests (Phase 8)
-- The contract (column shape) is fixed and used by v_instructor_capacity,
-- v_bucket_consumption, and the forecast RPC. Adding sources is purely
-- additive and does not change the schema of consumers.

create or replace view public.v_instructor_workload as
-- Source 1: Classes
select
  c.org_id                as org_id,
  cia.instructor_id       as instructor_id,
  'class'                 as source,
  c.id                    as source_id,
  c.name                  as source_label,
  cia.assigned_offerings  as quantity,
  ((case when c.is_multi_day and c.custom_day_hours is not null
      then (select sum(h) from unnest(c.custom_day_hours) h)
      else coalesce(c.hours_per_day, 0) * c.total_days end)
   + c.prep_hours_per_offering + c.logistics_hours_per_offering
  ) * cia.assigned_offerings as annual_hours,
  c.allocation_bucket_id  as bucket_id
from public.class_instructor_assignments cia
join public.classes c on c.id = cia.class_id and c.deleted_at is null
where cia.assigned_offerings > 0

union all
-- Source 2: Recurring tasks (active only). share_percent / 100 splits the
-- task's annual hours across each assignee.
select
  rt.org_id                                                                       as org_id,
  rta.instructor_id                                                               as instructor_id,
  'recurring_task'                                                                as source,
  rt.id                                                                           as source_id,
  rt.name                                                                         as source_label,
  null::integer                                                                   as quantity,
  rt.hours_per_occurrence
    * coalesce(rt.occurrences_per_year, public.frequency_to_annual(rt.frequency))
    * (rta.share_percent / 100.0)                                                 as annual_hours,
  rt.bucket_id                                                                    as bucket_id
from public.recurring_task_assignments rta
join public.recurring_tasks rt
  on rt.id = rta.recurring_task_id
 and rt.deleted_at is null
where rt.status = 'active'

union all
-- Source 5: Ad-hoc tasks (open + in_progress only; done/cancelled excluded
-- so completed work doesn't keep counting against capacity).
select
  aht.org_id        as org_id,
  aht.instructor_id as instructor_id,
  'ad_hoc_task'     as source,
  aht.id            as source_id,
  aht.name          as source_label,
  null::integer     as quantity,
  aht.hours         as annual_hours,
  aht.bucket_id     as bucket_id
from public.ad_hoc_tasks aht
where aht.instructor_id is not null
  and aht.status in ('open','in_progress');

-- ── v_instructor_capacity ────────────────────────────────────────────────────
-- Per-instructor rollup of assigned hours, utilization %, and a coarse status
-- bucket. Active, non-archived instructors only. Uses the workload view above
-- so adding new sources later automatically rolls up here.

create or replace view public.v_instructor_capacity as
select
  i.org_id,
  i.id                                          as instructor_id,
  i.full_name,
  i.annual_hours,
  coalesce(sum(w.annual_hours), 0)              as assigned_hours,
  coalesce(sum(w.annual_hours), 0) / nullif(i.annual_hours, 0) * 100 as utilization_pct,
  case
    when coalesce(sum(w.annual_hours), 0) / nullif(i.annual_hours, 0) >= 0.95 then 'over_allocated'
    when coalesce(sum(w.annual_hours), 0) / nullif(i.annual_hours, 0) >= 0.80 then 'at_risk'
    when coalesce(sum(w.annual_hours), 0) / nullif(i.annual_hours, 0) >= 0.40 then 'balanced'
    else 'under_utilized'
  end as utilization_status
from public.instructors i
left join public.v_instructor_workload w on w.instructor_id = i.id
where i.deleted_at is null
  and i.status = 'active'
group by i.org_id, i.id, i.full_name, i.annual_hours;

-- ── v_bucket_consumption ─────────────────────────────────────────────────────
-- Per-bucket rollup. Used by dashboards and bucket-allocation reports.

create or replace view public.v_bucket_consumption as
select
  org_id,
  bucket_id,
  sum(annual_hours) as consumed_hours
from public.v_instructor_workload
where bucket_id is not null
group by org_id, bucket_id;

-- ── instructor_capacity_forecast() RPC ───────────────────────────────────────
-- Returns a per-week forecast for an instructor over [p_start, p_start + p_weeks*7).
--
-- Per-source distribution:
--   - class:           annual_hours / 52 each week (even spread; refinement
--                      pending real class-schedule data)
--   - recurring_task:  occurrences_per_week × hours_per_occurrence × share%,
--                      using public.frequency_to_annual / 52 to get a per-week
--                      occurrence rate (fractional for monthly+)
--   - ad_hoc_task:     full hours land in the week containing due_date; if
--                      due_date is null the task isn't placed on the timeline
--                      (it shows in the assigned_hours total but not the
--                      forecast)
--
-- Weekly capacity = instructor.annual_hours / 52.

create or replace function public.instructor_capacity_forecast(
  p_instructor_id uuid,
  p_start         date,
  p_weeks         integer default 8
)
returns table (
  week_start       date,
  projected_hours  numeric,
  weekly_capacity  numeric,
  utilization_pct  numeric
)
language sql stable security definer
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
  -- Source 1: classes — even spread across 52 weeks
  class_per_week as (
    select sum(w.annual_hours) / 52.0 as per_week
    from public.v_instructor_workload w
    where w.instructor_id = p_instructor_id
      and w.source = 'class'
  ),
  -- Source 2: recurring — annual hours / 52 (share% already baked into annual_hours)
  recurring_per_week as (
    select sum(w.annual_hours) / 52.0 as per_week
    from public.v_instructor_workload w
    where w.instructor_id = p_instructor_id
      and w.source = 'recurring_task'
  ),
  -- Source 5: ad-hoc — placed in the ISO week of due_date (Mon-anchored)
  adhoc_by_week as (
    select
      date_trunc('week', aht.due_date)::date as week_start,
      sum(aht.hours)                          as hours
    from public.ad_hoc_tasks aht
    where aht.instructor_id = p_instructor_id
      and aht.status in ('open','in_progress')
      and aht.due_date is not null
    group by date_trunc('week', aht.due_date)::date
  )
select
  w.week_start,
  coalesce((select per_week from class_per_week), 0)
    + coalesce((select per_week from recurring_per_week), 0)
    + coalesce((select hours from adhoc_by_week ah where ah.week_start = w.week_start), 0)
    as projected_hours,
  (select annual_hours from inst) / 52.0 as weekly_capacity,
  case
    when (select annual_hours from inst) is null
      or (select annual_hours from inst) = 0 then null
    else (
      (coalesce((select per_week from class_per_week), 0)
        + coalesce((select per_week from recurring_per_week), 0)
        + coalesce((select hours from adhoc_by_week ah where ah.week_start = w.week_start), 0))
      / ((select annual_hours from inst) / 52.0)
    ) * 100
  end as utilization_pct
from weeks w
order by w.week_start;
$$;
