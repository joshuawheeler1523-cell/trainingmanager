-- =============================================================================
-- Authorization gates for SECURITY DEFINER RPCs that read tenant data.
-- =============================================================================
-- 20260604000003 revoked `anon` EXECUTE on these, but they remained callable by
-- any signed-in user via /rest/v1/rpc/*. Because they are SECURITY DEFINER they
-- bypass RLS entirely, so a user in tenant A who learned a UUID belonging to
-- tenant B could read B's data:
--
--   instructor_capacity_forecast   → any instructor's hours / capacity / utilization
--   qualified_instructors_for_class→ any org's instructor roster for a class
--   qualified_instructors_for_org  → any org's class → instructor mapping
--   agency_org_ids                 → any agency's org list
--
-- Each now re-applies the same visibility predicate its underlying table's RLS
-- SELECT policy uses, so the RPC can never return more than a plain SELECT
-- would. Unauthorized callers get zero rows rather than an error: these are
-- read paths, and empty is the same answer RLS would give.
--
-- auth.uid() survives SECURITY DEFINER (it reads a request JWT claim, not
-- current_user), so the helpers below are safe to call from inside them.
-- =============================================================================

-- ── Visibility helpers ───────────────────────────────────────────────────────
-- Mirror the `instructors_select` / `classes_select` RLS policies:
--   org membership AND (manager OR the row is in one of my departments)

create or replace function public.can_read_instructor(p_instructor_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1
    from public.instructors i
    where i.id = p_instructor_id
      and i.org_id in (select public.user_org_ids())
      and (
        public.is_manager(i.org_id)
        or i.department_id in (select public.user_department_ids())
      )
  );
$$;

comment on function public.can_read_instructor(uuid) is
  'True when the caller could SELECT this instructor under RLS. Used to gate SECURITY DEFINER RPCs that read instructor data.';

create or replace function public.can_read_class(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1
    from public.classes c
    where c.id = p_class_id
      and c.org_id in (select public.user_org_ids())
      and (
        public.is_manager(c.org_id)
        or c.department_id in (select public.user_department_ids())
      )
  );
$$;

comment on function public.can_read_class(uuid) is
  'True when the caller could SELECT this class under RLS. Used to gate SECURITY DEFINER RPCs that read class data.';

revoke execute on function public.can_read_instructor(uuid) from public, anon;
grant execute on function public.can_read_instructor(uuid) to authenticated, service_role;
revoke execute on function public.can_read_class(uuid) from public, anon;
grant execute on function public.can_read_class(uuid) to authenticated, service_role;

-- ── agency_org_ids ───────────────────────────────────────────────────────────
-- Gate on agency membership. No in-repo caller today (app code and RLS policies
-- both go through user_org_ids), so this only closes the REST surface.

create or replace function public.agency_org_ids(p_agency_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path to ''
as $$
  select id
  from public.organizations
  where agency_id = p_agency_id
    and public.is_agency_member(p_agency_id);
$$;

-- ── qualified_instructors_for_class ──────────────────────────────────────────

create or replace function public.qualified_instructors_for_class(p_class_id uuid)
returns table(instructor_id uuid)
language sql
stable
security definer
set search_path to ''
as $$
  with cls as (
    select org_id from public.classes where id = p_class_id
  ),
  required as (
    select skill_id, public.proficiency_rank(min_proficiency) as min_rank
    from public.class_skill_requirements
    where class_id = p_class_id
      and requirement = 'required'
  )
  select i.id
  from public.instructors i
  cross join cls
  where i.org_id = cls.org_id
    and i.deleted_at is null
    and i.status = 'active'
    and public.can_read_class(p_class_id)
    and not exists (
      select 1 from required r
      where not exists (
        select 1 from public.instructor_skills isk
        where isk.instructor_id = i.id
          and isk.skill_id = r.skill_id
          and public.proficiency_rank(isk.proficiency) >= r.min_rank
      )
    );
$$;

-- ── qualified_instructors_for_org ────────────────────────────────────────────

create or replace function public.qualified_instructors_for_org(p_org_id uuid, p_department_id uuid default null::uuid)
returns table(class_id uuid, instructor_id uuid)
language sql
stable
security definer
set search_path to ''
as $$
  with visible as (
    select p_org_id in (select public.user_org_ids()) as ok
  ),
  required as (
    select
      r.class_id,
      r.skill_id,
      public.proficiency_rank(r.min_proficiency) as min_rank
    from public.class_skill_requirements r
    where r.org_id = p_org_id
      and (p_department_id is null or r.department_id = p_department_id)
      and r.requirement = 'required'
  ),
  classes_with_reqs as (
    select distinct class_id from required
  ),
  active_instructors as (
    select id
    from public.instructors
    where org_id = p_org_id
      and (p_department_id is null or department_id = p_department_id)
      and deleted_at is null
      and status = 'active'
  )
  select
    c.class_id,
    i.id as instructor_id
  from classes_with_reqs c
  cross join active_instructors i
  where (select ok from visible)
    and not exists (
      select 1
      from required r
      where r.class_id = c.class_id
        and not exists (
          select 1 from public.instructor_skills isk
          where isk.instructor_id = i.id
            and isk.skill_id = r.skill_id
            and public.proficiency_rank(isk.proficiency) >= r.min_rank
        )
    );
$$;

-- ── instructor_capacity_forecast ─────────────────────────────────────────────
-- Body unchanged from 20260601000003 apart from the `where` on the final select.

create or replace function public.instructor_capacity_forecast(p_instructor_id uuid, p_start date, p_weeks integer default 8)
returns table(week_start date, projected_hours numeric, weekly_capacity numeric, utilization_pct numeric)
language sql
stable
security definer
set search_path to ''
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
where public.can_read_instructor(p_instructor_id)
order by w.week_start;
$$;

-- CREATE OR REPLACE resets grants to the default (public EXECUTE), so re-apply
-- the hardened grants from 20260604000003.
revoke execute on function public.agency_org_ids(uuid) from public, anon;
grant execute on function public.agency_org_ids(uuid) to authenticated, service_role;
revoke execute on function public.qualified_instructors_for_class(uuid) from public, anon;
grant execute on function public.qualified_instructors_for_class(uuid) to authenticated, service_role;
revoke execute on function public.qualified_instructors_for_org(uuid, uuid) from public, anon;
grant execute on function public.qualified_instructors_for_org(uuid, uuid) to authenticated, service_role;
revoke execute on function public.instructor_capacity_forecast(uuid, date, integer) from public, anon;
grant execute on function public.instructor_capacity_forecast(uuid, date, integer) to authenticated, service_role;
