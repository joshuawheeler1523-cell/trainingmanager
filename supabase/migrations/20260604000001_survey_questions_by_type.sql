-- =============================================================================
-- Deliverable-type-aware survey questions.
-- =============================================================================
-- A live class is rated on delivery (knowledge, clarity, engagement, pace) — the
-- trainer's craft. A job aid / education deliverable is an artifact, so pace and
-- engagement don't apply; it's rated on clarity, findability, and usefulness.
-- Two shared additions: "applicability" (I can use this) and, for job aids,
-- "findability" (I could quickly find what I needed).
-- =============================================================================

alter table public.instructor_feedback
  add column if not exists rating_apply smallint check (rating_apply between 1 and 5),
  add column if not exists rating_findability smallint check (rating_findability between 1 and 5);

-- ── feedback_link_context: also return source_type so the form can pick the
-- right question set (class = delivery; education_request = artifact). ─────────
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
      'source_type', l.source_type,
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

-- ── submit RPC: accept the two new optional ratings ──────────────────────────
drop function if exists public.submit_instructor_feedback(
  uuid, uuid, smallint, smallint, smallint, smallint, smallint, smallint, text, text, text, text
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
  p_user_agent      text     default null,
  p_apply           smallint default null,
  p_findability     smallint default null
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
  ) >= 500 then
    raise exception 'rate_limited';
  end if;

  insert into public.instructor_feedback (
    org_id, department_id, link_id, source_type, source_id, instructor_id,
    kirkpatrick_level, rating_overall, rating_knowledge, rating_clarity,
    rating_engagement, rating_pace, would_recommend, comment, respondent_name,
    ip, user_agent, rating_apply, rating_findability
  ) values (
    l.org_id, l.department_id, l.id, l.source_type, l.source_id, p_instructor_id,
    1, p_overall, p_knowledge, p_clarity, p_engagement, p_pace, p_recommend,
    left(p_comment, 2000), left(p_respondent_name, 120), p_ip, p_user_agent,
    p_apply, p_findability
  );
end;
$$;

revoke execute on function public.submit_instructor_feedback(
  uuid, uuid, smallint, smallint, smallint, smallint, smallint, smallint, text, text, text, text,
  smallint, smallint
) from public;
grant execute on function public.submit_instructor_feedback(
  uuid, uuid, smallint, smallint, smallint, smallint, smallint, smallint, text, text, text, text,
  smallint, smallint
) to anon, authenticated, service_role;

-- ── v_instructor_quality: expose applicability + findability averages ────────
create or replace view public.v_instructor_quality as
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
  else null end                                        as nps,
  round(avg(f.rating_apply)::numeric, 2)               as apply_avg,
  round(avg(f.rating_findability)::numeric, 2)         as findability_avg
from public.instructor_feedback f
group by f.org_id, f.department_id, f.instructor_id;

alter view public.v_instructor_quality set (security_invoker = true);
