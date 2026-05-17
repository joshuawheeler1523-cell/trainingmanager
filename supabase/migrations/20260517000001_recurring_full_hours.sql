-- Recurring tasks no longer divide hours across assignees.
--
-- The original model treated `share_percent` as a slice — a 2 h/week
-- meeting assigned to three instructors at 33.33% each charged each
-- instructor ~34 h/yr. But the actual usage is "every assigned
-- instructor attends this 2 h meeting every week", so each one should
-- be charged the full 104 h/yr.
--
-- Fix: drop the `* (rta.share_percent / 100.0)` factor from
-- v_instructor_workload's recurring_task row. Each assignment now
-- contributes the task's full annual hours, independent of how many
-- other instructors are also assigned.
--
-- We leave the `share_percent` column on `recurring_task_assignments`
-- (and its audit history) intact for backward compatibility. The
-- column is no longer consumed; new assignments default to 100.
--
-- Body otherwise mirrors 20260513000009 verbatim (the most recent
-- definition of the view).

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
    -- Full task hours per assignee (no share_percent factor).
    (rt.hours_per_occurrence * (COALESCE(rt.occurrences_per_year, frequency_to_annual(rt.frequency)))::numeric) AS annual_hours,
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

-- Default new assignments to 100% so callers can stop passing the
-- column explicitly. Existing rows with non-100 values are kept as-is
-- (audit history references them) but are now ignored by the view.
alter table public.recurring_task_assignments
  alter column share_percent set default 100;
