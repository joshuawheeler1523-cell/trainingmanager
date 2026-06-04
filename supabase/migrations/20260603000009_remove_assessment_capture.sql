-- =============================================================================
-- Remove learner assessment/self-report capture — Arbor is a feedback survey,
-- not an LMS. Reverts 20260603000006 (confidence/commitment) + 000007 (quiz) +
-- 000008 (revoke). Restores the simple anonymous reaction survey.
-- =============================================================================
-- Order matters: restore the function/view that reference the soon-to-be-dropped
-- objects FIRST, then drop the table and columns.

-- 1. feedback_link_context: stop serving quiz questions (drops dep on the table).
create or replace function public.feedback_link_context(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with link as (
    select * from public.instructor_feedback_links
    where token = p_token
      and is_active = true
      and (expires_at is null or expires_at > now())
  )
  select case when not exists (select 1 from link) then null::jsonb else (
    select jsonb_build_object(
      'label', l.label,
      'org_name', (select name from public.organizations where id = l.org_id),
      'instructors', coalesce((
        select jsonb_agg(distinct jsonb_build_object('id', i.id, 'name', i.full_name))
        from public.v_instructor_workload w
        join public.instructors i on i.id = w.instructor_id
        where w.org_id = l.org_id
          and w.source = l.source_type
          and w.source_id = l.source_id
      ), '[]'::jsonb)
    )
    from link l
  ) end;
$$;
revoke execute on function public.feedback_link_context(uuid) from public, authenticated;
grant execute on function public.feedback_link_context(uuid) to anon, authenticated, service_role;

-- 2. submit_instructor_feedback: back to the original 12-arg reaction insert.
drop function if exists public.submit_instructor_feedback(
  uuid, uuid, smallint, smallint, smallint, smallint, smallint, smallint, text, text, text, text,
  smallint, smallint, smallint, jsonb
);

create or replace function public.submit_instructor_feedback(
  p_token           uuid,
  p_instructor_id   uuid,
  p_overall         smallint,
  p_knowledge       smallint default null,
  p_clarity         smallint default null,
  p_engagement      smallint default null,
  p_pace            smallint default null,
  p_recommend       smallint default null,
  p_comment         text     default null,
  p_respondent_name text     default null,
  p_ip              text     default null,
  p_user_agent      text     default null
) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  l public.instructor_feedback_links;
begin
  select * into l
  from public.instructor_feedback_links
  where token = p_token
    and is_active = true
    and (expires_at is null or expires_at > now());
  if not found then
    raise exception 'inactive_link';
  end if;

  if not exists (
    select 1 from public.v_instructor_workload w
    where w.org_id = l.org_id
      and w.source = l.source_type
      and w.source_id = l.source_id
      and w.instructor_id = p_instructor_id
  ) then
    raise exception 'instructor_not_on_deliverable';
  end if;

  if p_ip is not null and (
    select count(*) from public.instructor_feedback
    where link_id = l.id
      and ip = p_ip
      and submitted_at > now() - interval '1 hour'
  ) >= 5 then
    raise exception 'rate_limited';
  end if;

  insert into public.instructor_feedback (
    org_id, department_id, link_id, source_type, source_id, instructor_id,
    kirkpatrick_level, rating_overall, rating_knowledge, rating_clarity,
    rating_engagement, rating_pace, would_recommend, comment, respondent_name, ip, user_agent
  ) values (
    l.org_id, l.department_id, l.id, l.source_type, l.source_id, p_instructor_id,
    1, p_overall, p_knowledge, p_clarity, p_engagement, p_pace, p_recommend,
    left(p_comment, 2000), left(p_respondent_name, 120), p_ip, p_user_agent
  );
end;
$$;

revoke execute on function public.submit_instructor_feedback(
  uuid, uuid, smallint, smallint, smallint, smallint, smallint, smallint, text, text, text, text
) from public;
grant execute on function public.submit_instructor_feedback(
  uuid, uuid, smallint, smallint, smallint, smallint, smallint, smallint, text, text, text, text
) to anon, authenticated, service_role;

-- 3. v_instructor_quality: back to the original L1 reaction aggregate (drop the
-- view first since CREATE OR REPLACE can't remove columns).
drop view if exists public.v_instructor_quality;
create view public.v_instructor_quality as
select
  f.org_id,
  f.department_id,
  f.instructor_id,
  count(*)                                              as response_count,
  round(avg(f.rating_overall)::numeric, 2)             as overall_avg,
  round(avg(f.rating_knowledge)::numeric, 2)           as knowledge_avg,
  round(avg(f.rating_clarity)::numeric, 2)             as clarity_avg,
  round(avg(f.rating_engagement)::numeric, 2)          as engagement_avg,
  round(avg(f.rating_pace)::numeric, 2)                as pace_avg,
  count(f.would_recommend)                             as nps_responses,
  count(*) filter (where f.would_recommend >= 9)       as promoters,
  count(*) filter (where f.would_recommend is not null and f.would_recommend <= 6) as detractors,
  case when count(f.would_recommend) > 0 then
    round(((count(*) filter (where f.would_recommend >= 9)
            - count(*) filter (where f.would_recommend is not null and f.would_recommend <= 6))::numeric
           / count(f.would_recommend)) * 100, 0)
  else null end                                        as nps
from public.instructor_feedback f
group by f.org_id, f.department_id, f.instructor_id;
alter view public.v_instructor_quality set (security_invoker = true);

-- 4. Drop the quiz table and the self-report / post-test columns.
drop table if exists public.feedback_link_questions;
alter table public.instructor_feedback
  drop column if exists confidence_before,
  drop column if exists confidence_after,
  drop column if exists intent_to_apply,
  drop column if exists knowledge_correct,
  drop column if exists knowledge_total;
