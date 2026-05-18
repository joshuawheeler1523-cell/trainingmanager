-- Add bucket_id to implementations + education_requests.
--
-- v_instructor_workload previously emitted NULL bucket_id for training-
-- planner sessions and education requests, which meant their hours
-- counted toward instructor utilization but didn't roll up into any
-- allocation-bucket consumption metric. That made the Team Utilization
-- bar look empty next to a non-zero percentage.
--
-- Fix: every workload source now anchors to an allocation bucket.
--   * implementations.bucket_id  → flows to every impl_session inside it
--   * education_requests.bucket_id → flows to every assignment row
--
-- Strategy:
--   1. Add nullable columns with FK ON DELETE RESTRICT (a bucket with
--      active work attached can't be silently deleted; archive instead).
--   2. Backfill existing rows with a best-fit guess per org:
--        - implementations  → bucket whose lowered name matches
--          %direct%train%, %instruction%, or %teach% — else the org's
--          first non-archived bucket by display_order.
--        - education_requests → bucket matching %course%develop%,
--          %develop%, or %curric% — else first non-archived bucket.
--   3. Leave the columns nullable at the DB layer. The app's Zod
--      schemas enforce required-ness at insert; we don't SET NOT NULL
--      because orgs that have implementations but zero buckets would
--      block the migration, and "Unbucketed" remains a valid display
--      fallback (the roster shows a neutral tail segment).
--   4. Recreate v_instructor_workload to read the new columns. Session
--      hours roll up to implementations.bucket_id; education-request
--      assignment hours roll up to education_requests.bucket_id.

-- 1. Columns + FKs
alter table public.implementations
  add column if not exists bucket_id uuid
    references public.allocation_buckets(id) on delete restrict;

create index if not exists implementations_bucket_id_idx
  on public.implementations (bucket_id);

alter table public.education_requests
  add column if not exists bucket_id uuid
    references public.allocation_buckets(id) on delete restrict;

create index if not exists education_requests_bucket_id_idx
  on public.education_requests (bucket_id);

-- 2. Backfill — per-org best-fit pick. Two CTEs, one per heuristic.

with org_default as (
  select distinct on (b.org_id)
    b.org_id,
    coalesce(
      (
        select b2.id
        from public.allocation_buckets b2
        where b2.org_id = b.org_id
          and b2.is_archived = false
          and (
            lower(b2.name) like '%direct%train%'
            or lower(b2.name) like '%instruction%'
            or lower(b2.name) like '%teach%'
          )
        order by b2.display_order, b2.created_at
        limit 1
      ),
      (
        select b3.id
        from public.allocation_buckets b3
        where b3.org_id = b.org_id
          and b3.is_archived = false
        order by b3.display_order, b3.created_at
        limit 1
      )
    ) as bucket_id
  from public.allocation_buckets b
)
update public.implementations i
   set bucket_id = od.bucket_id
  from org_default od
 where i.org_id = od.org_id
   and i.bucket_id is null
   and od.bucket_id is not null;

with org_default as (
  select distinct on (b.org_id)
    b.org_id,
    coalesce(
      (
        select b2.id
        from public.allocation_buckets b2
        where b2.org_id = b.org_id
          and b2.is_archived = false
          and (
            lower(b2.name) like '%course%develop%'
            or lower(b2.name) like '%develop%'
            or lower(b2.name) like '%curric%'
          )
        order by b2.display_order, b2.created_at
        limit 1
      ),
      (
        select b3.id
        from public.allocation_buckets b3
        where b3.org_id = b.org_id
          and b3.is_archived = false
        order by b3.display_order, b3.created_at
        limit 1
      )
    ) as bucket_id
  from public.allocation_buckets b
)
update public.education_requests er
   set bucket_id = od.bucket_id
  from org_default od
 where er.org_id = od.org_id
   and er.bucket_id is null
   and od.bucket_id is not null;

-- 3. Recreate v_instructor_workload so impl_sessions read
-- implementations.bucket_id and education_requests assignments read
-- education_requests.bucket_id. Body is otherwise identical to
-- 20260517000001 — only the two formerly-NULL `bucket_id` slots change.

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
    er.bucket_id
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
    i.bucket_id
   FROM (((impl_sessions s
     JOIN impl_classes c ON ((c.id = s.impl_class_id)))
     JOIN impl_trainers it ON ((it.id = s.impl_trainer_id)))
     JOIN implementations i ON ((i.id = s.implementation_id)))
  WHERE ((s.status = 'published'::text) AND (it.instructor_id IS NOT NULL) AND (s.impl_trainer_id IS NOT NULL));
