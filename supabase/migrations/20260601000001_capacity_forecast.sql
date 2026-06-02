-- =============================================================================
-- capacity_forecast — org/department forward supply-vs-demand, 12 monthly buckets
-- =============================================================================
-- Powers the Capacity Forecast page. Models forward demand vs available capacity
-- per calendar month, mirroring the per-week time-phasing in
-- instructor_capacity_forecast() but aggregated to months and split into:
--   • committed_hours — work already ASSIGNED to in-scope instructors
--   • pipeline_hours  — incoming work NOT yet staffed (so not in v_instructor_workload)
--   • pto_hours       — dated time-off that REDUCES availability that month
--   • available_hours — Σ(annual_hours/12) of active in-scope instructors − PTO
-- plus unestimated_pipeline_requests (unstaffed education requests have no hours
-- pre-assignment, so they surface as a per-month count, not fabricated hours).
--
-- SECURITY INVOKER (default): runs as the caller, so RLS enforces org/dept scope —
-- a manager sees all their org's rows; no cross-tenant leakage via the p_org_id arg.
--
-- Time-phasing & double-count rules:
--   class / recurring_task  → annualized: annual_hours/12 every month
--   ad_hoc_task (committed) → month of due_date; assigned, non-PTO bucket
--   education_request       → month of target_completion_date; assigned
--   project_task            → allocated_hours spread evenly over its start..end months
--   impl session            → actual hours in month of scheduled_start (published only)
--   PTO                     → assigned ad-hoc in a PTO-named bucket, by due_date month
--   pipeline ad-hoc         → unassigned ad-hoc (instructor_id is null), by due_date
--   pipeline implementation → planned rollouts (draft/active, windowed) with ZERO
--       published sessions yet: full planned hours (from impl_classes) spread over the
--       window months. Once scheduling starts (published sessions exist) the impl is
--       represented by its committed published sessions instead — avoids double-count.
-- =============================================================================

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
  -- Active, internal, in-scope instructors (on_leave/inactive contribute zero).
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
  -- PTO/leave buckets identified by name (no type column exists).
  pto_buckets as (
    select id
    from public.allocation_buckets
    where org_id = p_org_id
      and (
        name ilike '%pto%' or name ilike '%leave%' or name ilike '%vacation%'
        or name ilike '%time off%' or name ilike '%holiday%'
      )
  ),

  -- ── Committed (assigned) demand ────────────────────────────────────────────
  -- Annualized sources: spread flat across every month.
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

  -- ── PTO (reduces availability) ─────────────────────────────────────────────
  pto_by_month as (
    select date_trunc('month', aht.due_date)::date as m, sum(aht.hours) as hours
    from public.ad_hoc_tasks aht
    join scope_inst si on si.id = aht.instructor_id
    where aht.status in ('open', 'in_progress')
      and aht.due_date is not null
      and aht.bucket_id in (select id from pto_buckets)
    group by 1
  ),

  -- ── Pipeline (unstaffed, incoming) demand ──────────────────────────────────
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
  -- Planned rollouts not yet scheduled: full planned hours spread over the window.
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
  -- Unstaffed education requests have no pre-assignment hours estimate → count only.
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

revoke execute on function public.capacity_forecast(uuid, uuid, date, integer) from public;
grant execute on function public.capacity_forecast(uuid, uuid, date, integer)
  to authenticated, service_role;

comment on function public.capacity_forecast(uuid, uuid, date, integer) is
  'Org/department forward capacity forecast: per-month committed + pipeline demand vs available capacity (annual_hours/12 minus dated PTO). SECURITY INVOKER — RLS enforces scope.';
