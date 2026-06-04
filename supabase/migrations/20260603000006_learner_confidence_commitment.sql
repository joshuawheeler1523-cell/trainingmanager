-- =============================================================================
-- Learner self-report: confidence + commitment (New World Kirkpatrick L2)
-- =============================================================================
-- Adds two field-recognized LEADING INDICATORS of intended on-the-job transfer
-- to the post-session pulse, captured anonymously on the same QR:
--   • Confidence (retrospective then/now): "I can apply this in my work," rated
--     for BEFORE today and NOW. The post-then-pre design controls response-shift
--     bias (Howard & Dailey, 1979). This measures SELF-PERCEIVED change — not
--     objective knowledge, skill, or behavior.
--   • Commitment / intent to apply: "I intend to apply what I learned."
-- Both are self-reported leading indicators of transfer, NOT a competency or
-- behavior measurement. All columns optional/nullable.
-- =============================================================================

alter table public.instructor_feedback
  add column if not exists confidence_before smallint check (confidence_before between 1 and 5),
  add column if not exists confidence_after smallint check (confidence_after between 1 and 5),
  add column if not exists intent_to_apply smallint check (intent_to_apply between 1 and 5);

-- ── Extend the anon submission RPC with the three optional fields ─────────────
-- Drop the old signature first (adding params changes the signature, which would
-- otherwise create a second overload).
drop function if exists public.submit_instructor_feedback(
  uuid, uuid, smallint, smallint, smallint, smallint, smallint, smallint, text, text, text, text
);

create or replace function public.submit_instructor_feedback(
  p_token             uuid,
  p_instructor_id     uuid,
  p_overall           smallint,
  p_knowledge         smallint default null,
  p_clarity           smallint default null,
  p_engagement        smallint default null,
  p_pace              smallint default null,
  p_recommend         smallint default null,
  p_comment           text     default null,
  p_respondent_name   text     default null,
  p_ip                text     default null,
  p_user_agent        text     default null,
  p_confidence_before smallint default null,
  p_confidence_after  smallint default null,
  p_intent_to_apply   smallint default null
) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  l public.instructor_feedback_links;
begin
  -- Resolve the link from the token (the only credential). Tenant columns are
  -- taken from this row — never from the caller.
  select * into l
  from public.instructor_feedback_links
  where token = p_token
    and is_active = true
    and (expires_at is null or expires_at > now());
  if not found then
    raise exception 'inactive_link';
  end if;

  -- The picked instructor must actually be on THIS deliverable.
  if not exists (
    select 1 from public.v_instructor_workload w
    where w.org_id = l.org_id
      and w.source = l.source_type
      and w.source_id = l.source_id
      and w.instructor_id = p_instructor_id
  ) then
    raise exception 'instructor_not_on_deliverable';
  end if;

  -- Light anti-ballot-stuffing: <=5 submissions per (link, ip) per hour.
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
    rating_engagement, rating_pace, would_recommend, comment, respondent_name,
    ip, user_agent, confidence_before, confidence_after, intent_to_apply
  ) values (
    l.org_id, l.department_id, l.id, l.source_type, l.source_id, p_instructor_id,
    1, p_overall, p_knowledge, p_clarity, p_engagement, p_pace, p_recommend,
    left(p_comment, 2000), left(p_respondent_name, 120), p_ip, p_user_agent,
    p_confidence_before, p_confidence_after, p_intent_to_apply
  );
end;
$$;

revoke execute on function public.submit_instructor_feedback(
  uuid, uuid, smallint, smallint, smallint, smallint, smallint, smallint, text, text, text, text,
  smallint, smallint, smallint
) from public;
grant execute on function public.submit_instructor_feedback(
  uuid, uuid, smallint, smallint, smallint, smallint, smallint, smallint, text, text, text, text,
  smallint, smallint, smallint
) to anon, authenticated, service_role;

-- ── Surface the new self-report aggregates on the per-instructor view ─────────
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
  count(f.confidence_after)                            as confidence_responses,
  round(avg(f.confidence_before)::numeric, 2)          as confidence_before_avg,
  round(avg(f.confidence_after)::numeric, 2)           as confidence_after_avg,
  round(
    (avg(f.confidence_after - f.confidence_before)
       filter (where f.confidence_before is not null and f.confidence_after is not null))::numeric,
    2
  )                                                    as confidence_gain,
  count(f.intent_to_apply)                             as intent_responses,
  round(avg(f.intent_to_apply)::numeric, 2)            as intent_avg
from public.instructor_feedback f
group by f.org_id, f.department_id, f.instructor_id;

alter view public.v_instructor_quality set (security_invoker = true);
