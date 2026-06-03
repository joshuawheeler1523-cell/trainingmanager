-- ── Department-scope plumbing for aggregate views + RPCs ─────────────────────
-- Adds a department_id column to the three reporting views so app code can
-- filter them by the active department, and gives sidebar_counts /
-- qualified_instructors_for_org an optional p_department_id. Each instructor
-- belongs to exactly one department, so per-instructor aggregates carry that
-- department; workload rows carry the source entity's department.

-- v_instructor_workload: append department_id (source entity's department).
create or replace view public.v_instructor_workload as
 SELECT c.org_id,
    cia.instructor_id,
    'class'::text AS source,
    c.id AS source_id,
    c.name AS source_label,
    cia.assigned_offerings AS quantity,
    (
        CASE
            WHEN c.is_multi_day AND c.custom_day_hours IS NOT NULL THEN ( SELECT sum(h.h) AS sum
               FROM unnest(c.custom_day_hours) h(h))
            ELSE COALESCE(c.hours_per_day, 0::numeric) * c.total_days::numeric
        END + c.prep_hours_per_offering + c.logistics_hours_per_offering) * cia.assigned_offerings::numeric AS annual_hours,
    c.allocation_bucket_id AS bucket_id,
    c.department_id
   FROM class_instructor_assignments cia
     JOIN classes c ON c.id = cia.class_id AND c.deleted_at IS NULL
  WHERE cia.assigned_offerings > 0
UNION ALL
 SELECT rt.org_id,
    rta.instructor_id,
    'recurring_task'::text AS source,
    rt.id AS source_id,
    rt.name AS source_label,
    NULL::integer AS quantity,
    rt.hours_per_occurrence * COALESCE(rt.occurrences_per_year, frequency_to_annual(rt.frequency))::numeric AS annual_hours,
    rt.bucket_id,
    rt.department_id
   FROM recurring_task_assignments rta
     JOIN recurring_tasks rt ON rt.id = rta.recurring_task_id AND rt.deleted_at IS NULL
  WHERE rt.status = 'active'::text
UNION ALL
 SELECT aht.org_id,
    aht.instructor_id,
    'ad_hoc_task'::text AS source,
    aht.id AS source_id,
    aht.name AS source_label,
    NULL::integer AS quantity,
    aht.hours AS annual_hours,
    aht.bucket_id,
    aht.department_id
   FROM ad_hoc_tasks aht
  WHERE aht.instructor_id IS NOT NULL AND (aht.status = ANY (ARRAY['open'::text, 'in_progress'::text]))
UNION ALL
 SELECT era.org_id,
    era.instructor_id,
    'education_request'::text AS source,
    er.id AS source_id,
    er.title AS source_label,
    NULL::integer AS quantity,
    era.estimated_hours AS annual_hours,
    er.bucket_id,
    er.department_id
   FROM education_request_assignments era
     JOIN education_requests er ON er.id = era.request_id AND er.deleted_at IS NULL
  WHERE er.status <> ALL (ARRAY['completed'::text, 'archived'::text, 'rejected'::text])
UNION ALL
 SELECT ta.org_id,
    ptm.instructor_id,
    'project_task'::text AS source,
    t.id AS source_id,
    (p.name || ' · '::text) || t.name AS source_label,
    NULL::integer AS quantity,
    ta.allocated_hours AS annual_hours,
    p.bucket_id,
    t.department_id
   FROM task_assignments ta
     JOIN project_team_members ptm ON ptm.id = ta.project_team_member_id
     JOIN tasks t ON t.id = ta.task_id
     JOIN projects p ON p.id = t.project_id AND p.deleted_at IS NULL
  WHERE (p.status = ANY (ARRAY['planning'::text, 'active'::text])) AND (t.status = ANY (ARRAY['not_started'::text, 'in_progress'::text]))
UNION ALL
 SELECT s.org_id,
    it.instructor_id,
    'project_task'::text AS source,
    s.id AS source_id,
    (i.name || ' · '::text) || c.name AS source_label,
    NULL::integer AS quantity,
    EXTRACT(epoch FROM s.scheduled_end - s.scheduled_start) / 3600.0 AS annual_hours,
    i.bucket_id,
    i.department_id
   FROM impl_sessions s
     JOIN impl_classes c ON c.id = s.impl_class_id
     JOIN impl_trainers it ON it.id = s.impl_trainer_id
     JOIN implementations i ON i.id = s.implementation_id
  WHERE s.status = 'published'::text AND it.instructor_id IS NOT NULL AND s.impl_trainer_id IS NOT NULL;

alter view public.v_instructor_workload set (security_invoker = true);

-- v_instructor_capacity: append the instructor's department_id.
create or replace view public.v_instructor_capacity as
 SELECT i.org_id,
    i.id AS instructor_id,
    i.full_name,
    i.annual_hours,
    COALESCE(sum(w.annual_hours), 0::numeric) AS assigned_hours,
    COALESCE(sum(w.annual_hours), 0::numeric) / NULLIF(i.annual_hours, 0)::numeric * 100::numeric AS utilization_pct,
        CASE
            WHEN (COALESCE(sum(w.annual_hours), 0::numeric) / NULLIF(i.annual_hours, 0)::numeric) >= 0.95 THEN 'over_allocated'::text
            WHEN (COALESCE(sum(w.annual_hours), 0::numeric) / NULLIF(i.annual_hours, 0)::numeric) >= 0.80 THEN 'at_risk'::text
            WHEN (COALESCE(sum(w.annual_hours), 0::numeric) / NULLIF(i.annual_hours, 0)::numeric) >= 0.40 THEN 'balanced'::text
            ELSE 'under_utilized'::text
        END AS utilization_status,
    i.department_id
   FROM instructors i
     LEFT JOIN v_instructor_workload w ON w.instructor_id = i.id
  WHERE i.deleted_at IS NULL AND i.status = 'active'::text AND i.is_external = false
  GROUP BY i.org_id, i.id, i.full_name, i.annual_hours, i.department_id;

alter view public.v_instructor_capacity set (security_invoker = true);

-- v_bucket_consumption: append department_id (carried from the workload rows).
create or replace view public.v_bucket_consumption as
 SELECT org_id,
    bucket_id,
    sum(annual_hours) AS consumed_hours,
    department_id
   FROM v_instructor_workload
  WHERE bucket_id IS NOT NULL
  GROUP BY org_id, bucket_id, department_id;

alter view public.v_bucket_consumption set (security_invoker = true);

-- ── RPCs gain an optional p_department_id (null = org-wide) ───────────────────

drop function if exists public.sidebar_counts(uuid);
create or replace function public.sidebar_counts(p_org_id uuid, p_department_id uuid default null)
 returns table(work_intake_count integer, request_queue_count integer, one_on_ones_count integer)
 language sql
 stable
 set search_path to ''
as $function$
  SELECT
    (SELECT COUNT(*)::int FROM public.tras
       WHERE org_id = p_org_id
         AND (p_department_id IS NULL OR department_id = p_department_id)
         AND status = ANY(ARRAY['draft','documented','submitted','approved'])),
    (SELECT COUNT(*)::int FROM public.education_requests
       WHERE org_id = p_org_id
         AND (p_department_id IS NULL OR department_id = p_department_id)
         AND status = ANY(ARRAY['new','under_review'])
         AND deleted_at IS NULL),
    (SELECT COUNT(*)::int FROM public.one_on_ones
       WHERE org_id = p_org_id
         AND (p_department_id IS NULL OR department_id = p_department_id)
         AND completed_at IS NULL
         AND scheduled_for >= now()
         AND scheduled_for <= now() + interval '7 days');
$function$;

revoke execute on function public.sidebar_counts(uuid, uuid) from public, anon;
grant execute on function public.sidebar_counts(uuid, uuid) to authenticated, service_role;

drop function if exists public.qualified_instructors_for_org(uuid);
create or replace function public.qualified_instructors_for_org(p_org_id uuid, p_department_id uuid default null)
 returns table(class_id uuid, instructor_id uuid)
 language sql
 stable security definer
 set search_path to ''
as $function$
  with required as (
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
  where not exists (
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
$function$;

revoke execute on function public.qualified_instructors_for_org(uuid, uuid) from public, anon;
grant execute on function public.qualified_instructors_for_org(uuid, uuid) to authenticated, service_role;
