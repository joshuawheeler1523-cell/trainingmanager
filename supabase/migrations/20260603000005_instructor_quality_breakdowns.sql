-- =============================================================================
-- Instructor quality breakdowns: by deliverable type + monthly trend
-- =============================================================================
-- Powers the "is this person a better trainer than developer?" lens (quality
-- per source_type) and the over-time trend. Both security_invoker so RLS on
-- instructor_feedback (org-internal SELECT) applies — no anon exposure.
-- =============================================================================

-- Quality per (instructor, deliverable type) — the trainer-vs-developer lens.
create view public.v_instructor_quality_by_source as
select
  org_id,
  department_id,
  instructor_id,
  source_type,
  count(*)                                       as response_count,
  round(avg(rating_overall)::numeric, 2)         as overall_avg,
  count(would_recommend)                          as nps_responses,
  case when count(would_recommend) > 0 then
    round(((count(*) filter (where would_recommend >= 9)
            - count(*) filter (where would_recommend is not null and would_recommend <= 6))::numeric
           / count(would_recommend)) * 100, 0)
  else null end                                  as nps
from public.instructor_feedback
group by org_id, department_id, instructor_id, source_type;

alter view public.v_instructor_quality_by_source set (security_invoker = true);

-- Quality per (instructor, month) — the trend.
create view public.v_instructor_quality_monthly as
select
  org_id,
  department_id,
  instructor_id,
  date_trunc('month', submitted_at)::date        as month,
  count(*)                                       as response_count,
  round(avg(rating_overall)::numeric, 2)         as overall_avg,
  case when count(would_recommend) > 0 then
    round(((count(*) filter (where would_recommend >= 9)
            - count(*) filter (where would_recommend is not null and would_recommend <= 6))::numeric
           / count(would_recommend)) * 100, 0)
  else null end                                  as nps
from public.instructor_feedback
group by org_id, department_id, instructor_id, date_trunc('month', submitted_at);

alter view public.v_instructor_quality_monthly set (security_invoker = true);
