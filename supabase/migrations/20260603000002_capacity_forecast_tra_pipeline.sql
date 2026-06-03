-- =============================================================================
-- Add TRAs (work intake) as a pipeline layer to the capacity forecast.
-- =============================================================================
-- Documented/draft work-intake requests are anticipated demand the team will
-- have to staff, but until a TRA is converted to a project it appears nowhere
-- in the forecast. Add it to the PIPELINE layer (unstaffed, incoming):
--   • status in ('draft','documented')  — open intake, not yet a project
--   • converted_to_project_id IS NULL    — once converted, the project tasks
--                                          carry the load (no double-count)
--   • archived_at IS NULL, total_estimated_hours > 0
--   • dated by needed_by_date → placed in that month; undated → undated total.
-- =============================================================================

-- ── capacity_forecast: add pipeline_tra to pipeline_hours ────────────────────
create or replace function public.capacity_forecast(
  p_org_id        uuid,
  p_department_id uuid    default null,
  p_start         date    default date_trunc('month', current_date)::date,
  p_months        integer default 12
)
  returns table (
    month_start                  date,
    committed_hours              numeric,
    pipeline_hours               numeric,
    pto_hours                    numeric,
    available_hours              numeric,
    instructor_count             integer,
    unestimated_pipeline_requests integer
  )
  language sql
  stable
  set search_path = ''
as $$
  with
  months as (
    select (date_trunc('month', p_start) + (n || ' months')::interval)::date as m
    from generate_series(0, greatest(p_months, 1) - 1) n
  ),
  scope_inst as (
    select i.id, i.annual_hours
    from public.instructors i
    where i.org_id = p_org_id
      and i.deleted_at is null
      and i.status = 'active'
      and i.is_external = false
      and (p_department_id is null or i.department_id = p_department_id)
  ),
  headcount as (
    select count(*)::int as n, coalesce(sum(annual_hours), 0)::numeric as total_annual
    from scope_inst
  ),
  pto_buckets as (
    select id
    from public.allocation_buckets
    where org_id = p_org_id
      and (
        name ilike '%pto%' or name ilike '%leave%' or name ilike '%vacation%'
        or name ilike '%time off%' or name ilike '%holiday%'
      )
  ),
  annualized as (
    select coalesce(sum(w.annual_hours), 0) / 12.0 as per_month
    from public.v_instructor_workload w
    join scope_inst si on si.id = w.instructor_id
    where w.source in ('class', 'recurring_task')
  ),
  adhoc_committed as (
    select date_trunc('month', aht.due_date)::date as m, sum(aht.hours) as hours
    from public.ad_hoc_tasks aht
    join scope_inst si on si.id = aht.instructor_id
    where aht.status in ('open', 'in_progress')
      and aht.due_date is not null
      and (aht.bucket_id is null or aht.bucket_id not in (select id from pto_buckets))
    group by 1
  ),
  edreq_committed as (
    select date_trunc('month', er.target_completion_date)::date as m,
           sum(era.estimated_hours) as hours
    from public.education_request_assignments era
    join public.education_requests er on er.id = era.request_id
    join scope_inst si on si.id = era.instructor_id
    where er.target_completion_date is not null
      and er.deleted_at is null
      and er.status not in ('completed', 'archived', 'rejected')
    group by 1
  ),
  project_rows as (
    select ta.allocated_hours,
           date_trunc('month', coalesce(t.start_date, t.end_date))::date as m_lo,
           date_trunc('month', coalesce(t.end_date, t.start_date))::date as m_hi
    from public.task_assignments ta
    join public.project_team_members ptm on ptm.id = ta.project_team_member_id
    join scope_inst si on si.id = ptm.instructor_id
    join public.tasks t on t.id = ta.task_id
    join public.projects p on p.id = t.project_id and p.deleted_at is null
    where p.status in ('planning', 'active')
      and t.status in ('not_started', 'in_progress')
      and coalesce(t.start_date, t.end_date) is not null
  ),
  project_committed as (
    select gm::date as m,
           sum(
             r.allocated_hours
             / (((extract(year from r.m_hi) - extract(year from r.m_lo)) * 12
                 + (extract(month from r.m_hi) - extract(month from r.m_lo)))::int + 1)
           ) as hours
    from project_rows r,
    lateral generate_series(r.m_lo, r.m_hi, interval '1 month') gm
    group by 1
  ),
  impl_committed as (
    select date_trunc('month', s.scheduled_start)::date as m,
           sum(extract(epoch from (s.scheduled_end - s.scheduled_start)) / 3600.0) as hours
    from public.impl_sessions s
    join public.impl_trainers it on it.id = s.impl_trainer_id
    join scope_inst si on si.id = it.instructor_id
    where s.status = 'published'
    group by 1
  ),
  pto_by_month as (
    select date_trunc('month', aht.due_date)::date as m, sum(aht.hours) as hours
    from public.ad_hoc_tasks aht
    join scope_inst si on si.id = aht.instructor_id
    where aht.status in ('open', 'in_progress')
      and aht.due_date is not null
      and aht.bucket_id in (select id from pto_buckets)
    group by 1
  ),
  pipeline_adhoc as (
    select date_trunc('month', aht.due_date)::date as m, sum(aht.hours) as hours
    from public.ad_hoc_tasks aht
    where aht.org_id = p_org_id
      and aht.instructor_id is null
      and aht.status in ('open', 'in_progress')
      and aht.due_date is not null
      and (aht.bucket_id is null or aht.bucket_id not in (select id from pto_buckets))
      and (p_department_id is null or aht.department_id = p_department_id)
    group by 1
  ),
  impl_planned as (
    select im.id,
           date_trunc('month', im.window_start_date)::date as m_lo,
           date_trunc('month', im.window_end_date)::date as m_hi,
           coalesce((
             select sum(
               ceil(ic.total_people_to_train::numeric
                    / nullif(ic.expected_learners_per_session, 0))
               * ic.hours_per_session
             )
             from public.impl_classes ic
             where ic.implementation_id = im.id
           ), 0) as planned_hours
    from public.implementations im
    where im.org_id = p_org_id
      and im.deleted_at is null
      and im.status in ('draft', 'active')
      and im.window_start_date is not null
      and im.window_end_date is not null
      and im.window_end_date >= im.window_start_date
      and (p_department_id is null or im.department_id = p_department_id)
      and not exists (
        select 1 from public.impl_sessions s
        where s.implementation_id = im.id and s.status = 'published'
      )
  ),
  pipeline_impl as (
    select gm::date as m,
           sum(
             r.planned_hours
             / (((extract(year from r.m_hi) - extract(year from r.m_lo)) * 12
                 + (extract(month from r.m_hi) - extract(month from r.m_lo)))::int + 1)
           ) as hours
    from impl_planned r,
    lateral generate_series(r.m_lo, r.m_hi, interval '1 month') gm
    where r.planned_hours > 0
    group by 1
  ),
  -- NEW: documented/draft work-intake (TRAs) not yet converted to a project.
  pipeline_tra as (
    select date_trunc('month', t.needed_by_date)::date as m, sum(t.total_estimated_hours) as hours
    from public.tras t
    where t.org_id = p_org_id
      and t.archived_at is null
      and t.converted_to_project_id is null
      and t.status in ('draft', 'documented')
      and t.needed_by_date is not null
      and t.total_estimated_hours > 0
      and (p_department_id is null or t.department_id = p_department_id)
    group by 1
  ),
  unestimated_reqs as (
    select date_trunc('month', er.target_completion_date)::date as m, count(*)::int as n
    from public.education_requests er
    where er.org_id = p_org_id
      and er.deleted_at is null
      and er.target_completion_date is not null
      and er.status not in ('completed', 'archived', 'rejected')
      and (p_department_id is null or er.department_id = p_department_id)
      and not exists (
        select 1 from public.education_request_assignments era where era.request_id = er.id
      )
    group by 1
  )

  select
    mo.m as month_start,
    (
      (select per_month from annualized)
      + coalesce((select hours from adhoc_committed   x where x.m = mo.m), 0)
      + coalesce((select hours from edreq_committed   x where x.m = mo.m), 0)
      + coalesce((select hours from project_committed x where x.m = mo.m), 0)
      + coalesce((select hours from impl_committed    x where x.m = mo.m), 0)
    ) as committed_hours,
    (
      coalesce((select hours from pipeline_adhoc x where x.m = mo.m), 0)
      + coalesce((select hours from pipeline_impl x where x.m = mo.m), 0)
      + coalesce((select hours from pipeline_tra  x where x.m = mo.m), 0)
    ) as pipeline_hours,
    coalesce((select hours from pto_by_month x where x.m = mo.m), 0) as pto_hours,
    greatest(
      0,
      (select total_annual from headcount) / 12.0
        - coalesce((select hours from pto_by_month x where x.m = mo.m), 0)
    ) as available_hours,
    (select n from headcount) as instructor_count,
    coalesce((select n from unestimated_reqs x where x.m = mo.m), 0) as unestimated_pipeline_requests
  from months mo
  order by mo.m;
$$;

-- ── capacity_forecast_undated: include undated TRA pipeline ──────────────────
create or replace function public.capacity_forecast_undated(
  p_org_id        uuid,
  p_department_id uuid default null
)
  returns numeric
  language sql
  stable
  set search_path = ''
as $$
  with scope_inst as (
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
  select
    coalesce((
      select sum(aht.hours)
      from public.ad_hoc_tasks aht
      join scope_inst si on si.id = aht.instructor_id
      where aht.status in ('open', 'in_progress')
        and aht.due_date is null
        and (aht.bucket_id is null or aht.bucket_id not in (select id from pto_buckets))
    ), 0)
    + coalesce((
      select sum(era.estimated_hours)
      from public.education_request_assignments era
      join public.education_requests er on er.id = era.request_id
      join scope_inst si on si.id = era.instructor_id
      where er.deleted_at is null
        and er.status not in ('completed', 'archived', 'rejected')
        and er.target_completion_date is null
    ), 0)
    + coalesce((
      select sum(ta.allocated_hours)
      from public.task_assignments ta
      join public.project_team_members ptm on ptm.id = ta.project_team_member_id
      join scope_inst si on si.id = ptm.instructor_id
      join public.tasks t on t.id = ta.task_id
      join public.projects pr on pr.id = t.project_id and pr.deleted_at is null
      where pr.status in ('planning', 'active')
        and t.status in ('not_started', 'in_progress')
        and t.start_date is null
        and t.end_date is null
    ), 0)
    + coalesce((
      select sum(t.total_estimated_hours)
      from public.tras t
      where t.org_id = p_org_id
        and t.archived_at is null
        and t.converted_to_project_id is null
        and t.status in ('draft', 'documented')
        and t.needed_by_date is null
        and t.total_estimated_hours > 0
        and (p_department_id is null or t.department_id = p_department_id)
    ), 0);
$$;

-- ── capacity_forecast_items: add the TRA drill-down rows ─────────────────────
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
  select 'committed', 'ad_hoc_task', aht.name, aht.hours, aht.due_date, aht.due_date, null, null
  from public.ad_hoc_tasks aht
  join scope_inst si on si.id = aht.instructor_id
  cross join hz
  where aht.status in ('open', 'in_progress')
    and aht.due_date is not null
    and (aht.bucket_id is null or aht.bucket_id not in (select id from pto_buckets))
    and date_trunc('month', aht.due_date)::date between hz.lo and hz.hi

  union all
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
  -- NEW: pipeline TRAs (work intake), dated by needed_by_date, in horizon.
  select 'pipeline', 'tra', t.project_name, t.total_estimated_hours,
         t.needed_by_date, t.needed_by_date, 'tra', t.id
  from public.tras t
  cross join hz
  where t.org_id = p_org_id
    and t.archived_at is null
    and t.converted_to_project_id is null
    and t.status in ('draft', 'documented')
    and t.needed_by_date is not null
    and t.total_estimated_hours > 0
    and (p_department_id is null or t.department_id = p_department_id)
    and date_trunc('month', t.needed_by_date)::date between hz.lo and hz.hi

  union all
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
