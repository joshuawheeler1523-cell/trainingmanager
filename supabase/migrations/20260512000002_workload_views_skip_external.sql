-- v_instructor_capacity selects from public.instructors directly. Without an
-- is_external filter, external/consultant trainers added in 20260512000001
-- would appear in the capacity rollup as 0-hour, under_utilized rows — leaking
-- into the very surfaces (dashboard, allocations, workload reports) we just
-- told to filter them out on the application side. Add the filter inside the
-- view too so any consumer (now or later) is automatically scoped.
--
-- v_instructor_workload is keyed by source assignments (classes / recurring /
-- ad-hoc) and externals are never assignable through those flows, so it
-- doesn't need a corresponding filter today. Belt-and-suspenders only if a
-- future code path inserts an external into one of those assignment tables.

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
  and i.is_external = false
group by i.org_id, i.id, i.full_name, i.annual_hours;
