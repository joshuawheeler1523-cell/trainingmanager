-- =============================================================================
-- capacity_forecast_undated — committed hours that can't be placed on the timeline
-- =============================================================================
-- The forecast only time-phases work that has a date. Committed work with no
-- date (ad-hoc without a due_date, education request without a target date,
-- project task with no start/end) is real load but can't be put in a month, so
-- it's excluded from the monthly bars. This companion returns the in-scope total
-- so the UI can footnote it ("+ X h undated committed, not shown") rather than
-- silently understate demand. Same scope rules + SECURITY INVOKER as
-- capacity_forecast.
-- =============================================================================

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
    ), 0);
$$;

revoke execute on function public.capacity_forecast_undated(uuid, uuid) from public;
grant execute on function public.capacity_forecast_undated(uuid, uuid) to authenticated, service_role;

comment on function public.capacity_forecast_undated(uuid, uuid) is
  'Total committed hours with no date (cannot be time-phased) for the forecast scope. Surfaced as a footnote so the monthly forecast does not silently understate demand.';
