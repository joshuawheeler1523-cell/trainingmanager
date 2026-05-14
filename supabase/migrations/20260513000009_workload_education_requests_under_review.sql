-- v_instructor_workload education_request filter was too narrow.
--
-- Original: `er.status in ('approved','assigned','in_progress')`.
-- Bug: A manager could assign hours to an instructor on a request that's
-- still `under_review` — the assignment exists, the instructor has been
-- told "this is yours" — but it never appeared in the instructor's
-- workload page or 1:1 totals because the request hadn't crossed
-- approved yet.
--
-- New filter: include every status that represents work the instructor
-- is on the hook for. That's everything except completed / archived /
-- rejected. `new` is included too because (rarely) a planner sketches a
-- request with provisional assignments before the formal review.
--
-- Same fix applied to instructor_capacity_forecast since it uses the
-- same status gate independently.

create or replace view public.v_instructor_workload as
 SELECT c.org_id,
    cia.instructor_id,
    'class'::text AS source,
    c.id AS source_id,
    c.name AS source_label,
    cia.assigned_offerings AS quantity,
    (((
        CASE
            WHEN (c.is_multi_day AND (c.custom_day_hours IS NOT NULL)) THEN ( SELECT sum(h.h) AS sum
               FROM unnest(c.custom_day_hours) h(h))
            ELSE (COALESCE(c.hours_per_day, (0)::numeric) * (c.total_days)::numeric)
        END + c.prep_hours_per_offering) + c.logistics_hours_per_offering) * (cia.assigned_offerings)::numeric) AS annual_hours,
    c.allocation_bucket_id AS bucket_id
   FROM (class_instructor_assignments cia
     JOIN classes c ON (((c.id = cia.class_id) AND (c.deleted_at IS NULL))))
  WHERE (cia.assigned_offerings > 0)
UNION ALL
 SELECT rt.org_id,
    rta.instructor_id,
    'recurring_task'::text AS source,
    rt.id AS source_id,
    rt.name AS source_label,
    NULL::integer AS quantity,
    ((rt.hours_per_occurrence * (COALESCE(rt.occurrences_per_year, frequency_to_annual(rt.frequency)))::numeric) * (rta.share_percent / 100.0)) AS annual_hours,
    rt.bucket_id
   FROM (recurring_task_assignments rta
     JOIN recurring_tasks rt ON (((rt.id = rta.recurring_task_id) AND (rt.deleted_at IS NULL))))
  WHERE (rt.status = 'active'::text)
UNION ALL
 SELECT aht.org_id,
    aht.instructor_id,
    'ad_hoc_task'::text AS source,
    aht.id AS source_id,
    aht.name AS source_label,
    NULL::integer AS quantity,
    aht.hours AS annual_hours,
    aht.bucket_id
   FROM ad_hoc_tasks aht
  WHERE ((aht.instructor_id IS NOT NULL) AND (aht.status = ANY (ARRAY['open'::text, 'in_progress'::text])))
UNION ALL
 SELECT era.org_id,
    era.instructor_id,
    'education_request'::text AS source,
    er.id AS source_id,
    er.title AS source_label,
    NULL::integer AS quantity,
    era.estimated_hours AS annual_hours,
    NULL::uuid AS bucket_id
   FROM (education_request_assignments era
     JOIN education_requests er ON (((er.id = era.request_id) AND (er.deleted_at IS NULL))))
  -- WIDENED: assigning hours commits the instructor's time regardless of
  -- the request's review status. Exclude only the terminal / dead states.
  WHERE (er.status NOT IN ('completed','archived','rejected'))
UNION ALL
 SELECT ta.org_id,
    ptm.instructor_id,
    'project_task'::text AS source,
    t.id AS source_id,
    ((p.name || ' · '::text) || t.name) AS source_label,
    NULL::integer AS quantity,
    ta.allocated_hours AS annual_hours,
    p.bucket_id
   FROM (((task_assignments ta
     JOIN project_team_members ptm ON ((ptm.id = ta.project_team_member_id)))
     JOIN tasks t ON ((t.id = ta.task_id)))
     JOIN projects p ON (((p.id = t.project_id) AND (p.deleted_at IS NULL))))
  WHERE ((p.status = ANY (ARRAY['planning'::text, 'active'::text])) AND (t.status = ANY (ARRAY['not_started'::text, 'in_progress'::text])))
UNION ALL
 SELECT s.org_id,
    it.instructor_id,
    'project_task'::text AS source,
    s.id AS source_id,
    ((i.name || ' · '::text) || c.name) AS source_label,
    NULL::integer AS quantity,
    (EXTRACT(epoch FROM (s.scheduled_end - s.scheduled_start)) / 3600.0) AS annual_hours,
    NULL::uuid AS bucket_id
   FROM (((impl_sessions s
     JOIN impl_classes c ON ((c.id = s.impl_class_id)))
     JOIN impl_trainers it ON ((it.id = s.impl_trainer_id)))
     JOIN implementations i ON ((i.id = s.implementation_id)))
  WHERE ((s.status = 'published'::text) AND (it.instructor_id IS NOT NULL) AND (s.impl_trainer_id IS NOT NULL));

-- Forecast RPC mirrors the same widened gate so capacity projections
-- include under-review-but-assigned hours too. Same body as
-- 20260513000007 with one line changed.
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
  edreq_by_week as (
    select
      date_trunc('week', er.target_completion_date)::date as week_start,
      sum(era.estimated_hours)                            as hours
    from public.education_request_assignments era
    join public.education_requests er on er.id = era.request_id
    where era.instructor_id = p_instructor_id
      and er.target_completion_date is not null
      and er.deleted_at is null
      -- Same widened gate as v_instructor_workload above.
      and er.status not in ('completed','archived','rejected')
    group by date_trunc('week', er.target_completion_date)::date
  ),
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
