-- =============================================================================
-- capacity_forecast_items — the actual work behind the forecast's committed/pipeline
-- =============================================================================
-- Drill-down companion to capacity_forecast(): one row per work item that feeds
-- the aggregate, so a manager can see WHAT the committed and pipeline hours are.
-- Same scope rules + SECURITY INVOKER. Annualized items (classes, recurring
-- tasks) are "ongoing" (no dates). Dated items are included when they fall in /
-- overlap the 12-month horizon. Hours are the item's in-scope total (not the
-- monthly slice). link_type/link_id point at a detail page where one exists.
-- =============================================================================

create or replace function public.capacity_forecast_items(
  p_org_id        uuid,
  p_department_id uuid    default null,
  p_start         date    default date_trunc('month', current_date)::date,
  p_months        integer default 12
)
  returns table (
    layer     text,
    source    text,
    label     text,
    hours     numeric,
    starts    date,
    ends      date,
    link_type text,
    link_id   uuid
  )
  language sql
  stable
  set search_path = ''
as $$
  with
  hz as (
    select date_trunc('month', p_start)::date as lo,
           (date_trunc('month', p_start) + ((greatest(p_months, 1) - 1) || ' months')::interval)::date as hi
  ),
  scope_inst as (
    select i.id
    from public.instructors i
    where i.org_id = p_org_id
      and i.deleted_at is null
      and i.status = 'active'
      and i.is_external = false
      and (p_department_id is null or i.department_id = p_department_id)
  ),
  pto_buckets as (
    select id from public.allocation_buckets
    where org_id = p_org_id
      and (
        name ilike '%pto%' or name ilike '%leave%' or name ilike '%vacation%'
        or name ilike '%time off%' or name ilike '%holiday%'
      )
  )

  -- ── Committed: classes + recurring (annualized, ongoing) ───────────────────
  select 'committed' as layer, w.source,
         w.source_label as label, sum(w.annual_hours) as hours,
         null::date as starts, null::date as ends,
         (case when w.source = 'class' then 'class' end) as link_type,
         (case when w.source = 'class' then w.source_id end) as link_id
  from public.v_instructor_workload w
  join scope_inst si on si.id = w.instructor_id
  where w.source in ('class', 'recurring_task')
  group by w.source, w.source_label, w.source_id

  union all
  -- Committed ad-hoc (dated, in horizon, non-PTO)
  select 'committed', 'ad_hoc_task', aht.name, aht.hours, aht.due_date, aht.due_date, null, null
  from public.ad_hoc_tasks aht
  join scope_inst si on si.id = aht.instructor_id
  cross join hz
  where aht.status in ('open', 'in_progress')
    and aht.due_date is not null
    and (aht.bucket_id is null or aht.bucket_id not in (select id from pto_buckets))
    and date_trunc('month', aht.due_date)::date between hz.lo and hz.hi

  union all
  -- Committed education requests (dated, in horizon)
  select 'committed', 'education_request', er.title, sum(era.estimated_hours),
         er.target_completion_date, er.target_completion_date, null, null
  from public.education_request_assignments era
  join public.education_requests er on er.id = era.request_id
  join scope_inst si on si.id = era.instructor_id
  cross join hz
  where er.target_completion_date is not null
    and er.deleted_at is null
    and er.status not in ('completed', 'archived', 'rejected')
    and date_trunc('month', er.target_completion_date)::date between hz.lo and hz.hi
  group by er.id, er.title, er.target_completion_date

  union all
  -- Committed project tasks (dated window overlaps horizon)
  select 'committed', 'project_task', pr.name || ' · ' || t.name, sum(ta.allocated_hours),
         t.start_date, t.end_date, 'project', pr.id
  from public.task_assignments ta
  join public.project_team_members ptm on ptm.id = ta.project_team_member_id
  join scope_inst si on si.id = ptm.instructor_id
  join public.tasks t on t.id = ta.task_id
  join public.projects pr on pr.id = t.project_id and pr.deleted_at is null
  cross join hz
  where pr.status in ('planning', 'active')
    and t.status in ('not_started', 'in_progress')
    and coalesce(t.start_date, t.end_date) is not null
    and date_trunc('month', coalesce(t.start_date, t.end_date))::date <= hz.hi
    and date_trunc('month', coalesce(t.end_date, t.start_date))::date >= hz.lo
  group by pr.id, pr.name, t.id, t.name, t.start_date, t.end_date

  union all
  -- Committed implementation sessions (published, in horizon), rolled up per implementation
  select 'committed', 'impl_session', im.name,
         sum(extract(epoch from (s.scheduled_end - s.scheduled_start)) / 3600.0),
         min(s.scheduled_start)::date, max(s.scheduled_start)::date,
         'implementation', im.id
  from public.impl_sessions s
  join public.impl_trainers it on it.id = s.impl_trainer_id
  join scope_inst si on si.id = it.instructor_id
  join public.implementations im on im.id = s.implementation_id
  cross join hz
  where s.status = 'published'
    and date_trunc('month', s.scheduled_start)::date between hz.lo and hz.hi
  group by im.id, im.name

  union all
  -- ── Pipeline: unassigned ad-hoc (dated, in horizon) ────────────────────────
  select 'pipeline', 'ad_hoc_task', aht.name, aht.hours, aht.due_date, aht.due_date, null, null
  from public.ad_hoc_tasks aht
  cross join hz
  where aht.org_id = p_org_id
    and aht.instructor_id is null
    and aht.status in ('open', 'in_progress')
    and aht.due_date is not null
    and (aht.bucket_id is null or aht.bucket_id not in (select id from pto_buckets))
    and (p_department_id is null or aht.department_id = p_department_id)
    and date_trunc('month', aht.due_date)::date between hz.lo and hz.hi

  union all
  -- Pipeline: planned implementations not yet scheduled (window overlaps horizon)
  select 'pipeline', 'impl_planned', im.name,
         coalesce((
           select sum(ceil(ic.total_people_to_train::numeric
                            / nullif(ic.expected_learners_per_session, 0)) * ic.hours_per_session)
           from public.impl_classes ic where ic.implementation_id = im.id
         ), 0),
         im.window_start_date, im.window_end_date, 'implementation', im.id
  from public.implementations im
  cross join hz
  where im.org_id = p_org_id
    and im.deleted_at is null
    and im.status in ('draft', 'active')
    and im.window_start_date is not null
    and im.window_end_date is not null
    and im.window_end_date >= im.window_start_date
    and (p_department_id is null or im.department_id = p_department_id)
    and date_trunc('month', im.window_start_date)::date <= hz.hi
    and date_trunc('month', im.window_end_date)::date >= hz.lo
    and not exists (
      select 1 from public.impl_sessions s
      where s.implementation_id = im.id and s.status = 'published'
    )

  union all
  -- Pipeline: unstaffed education requests (no hours estimate yet → null hours)
  select 'pipeline', 'unestimated_request', er.title, null::numeric,
         er.target_completion_date, er.target_completion_date, null, null
  from public.education_requests er
  cross join hz
  where er.org_id = p_org_id
    and er.deleted_at is null
    and er.target_completion_date is not null
    and er.status not in ('completed', 'archived', 'rejected')
    and (p_department_id is null or er.department_id = p_department_id)
    and date_trunc('month', er.target_completion_date)::date between hz.lo and hz.hi
    and not exists (
      select 1 from public.education_request_assignments era where era.request_id = er.id
    );
$$;

revoke execute on function public.capacity_forecast_items(uuid, uuid, date, integer) from public;
grant execute on function public.capacity_forecast_items(uuid, uuid, date, integer)
  to authenticated, service_role;

comment on function public.capacity_forecast_items(uuid, uuid, date, integer) is
  'Per-item drill-down behind capacity_forecast: the actual committed + pipeline work items for the scope/horizon. SECURITY INVOKER — RLS enforces scope.';
