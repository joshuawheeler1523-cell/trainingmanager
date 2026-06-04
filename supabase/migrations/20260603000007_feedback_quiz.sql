-- =============================================================================
-- Knowledge post-test (objective Kirkpatrick Level 2 — "learning")
-- =============================================================================
-- A short manager-authored MCQ attached to a deliverable's feedback link. The
-- learner answers on the same QR; the score is the only objective learning
-- measure in the model. Security design: the correct answers NEVER reach the
-- anonymous client — feedback_link_context serves prompts/options WITHOUT the
-- key, and submit_instructor_feedback scores server-side (SECURITY DEFINER).
-- =============================================================================

create table if not exists public.feedback_link_questions (
  id            uuid        not null default gen_random_uuid() primary key,
  org_id        uuid        not null references public.organizations(id) on delete cascade,
  department_id uuid        not null references public.departments(id) on delete cascade,
  link_id       uuid        not null references public.instructor_feedback_links(id) on delete cascade,
  position      smallint    not null default 0,
  prompt        text        not null,
  options       jsonb       not null, -- array of 2–5 option strings
  correct_index smallint    not null check (correct_index >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.feedback_link_questions (link_id, position);

alter table public.feedback_link_questions enable row level security;
-- Internal can read (managers author; the page lists them). Anon has NO direct
-- access — questions are served key-less by feedback_link_context and scored by
-- submit_instructor_feedback, both SECURITY DEFINER.
create policy "flq_select_internal" on public.feedback_link_questions
  for select using (org_id in (select public.user_org_ids()));
create policy "flq_modify_manager" on public.feedback_link_questions
  for all using (public.is_manager(org_id)) with check (public.is_manager(org_id));

select public.apply_standard_triggers('feedback_link_questions');

-- Per-submission post-test score.
alter table public.instructor_feedback
  add column if not exists knowledge_correct smallint check (knowledge_correct >= 0),
  add column if not exists knowledge_total smallint check (knowledge_total >= 0);

-- ── Serve the quiz to the anon form WITHOUT the answer key ────────────────────
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
      ), '[]'::jsonb),
      'questions', coalesce((
        select jsonb_agg(
          jsonb_build_object('id', q.id, 'prompt', q.prompt, 'options', q.options)
          order by q.position, q.id
        )
        from public.feedback_link_questions q
        where q.link_id = l.id
      ), '[]'::jsonb)
    )
    from link l
  ) end;
$$;
revoke execute on function public.feedback_link_context(uuid) from public, authenticated;
grant execute on function public.feedback_link_context(uuid) to anon, authenticated, service_role;

-- ── Extend the submit RPC: score the post-test server-side ────────────────────
drop function if exists public.submit_instructor_feedback(
  uuid, uuid, smallint, smallint, smallint, smallint, smallint, smallint, text, text, text, text,
  smallint, smallint, smallint
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
  p_intent_to_apply   smallint default null,
  p_quiz_answers      jsonb    default null
) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  l public.instructor_feedback_links;
  v_total   smallint := null;
  v_correct smallint := null;
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

  -- Score the post-test against the stored key (never exposed to the client).
  -- An unanswered question counts as incorrect; denominator = questions on link.
  if p_quiz_answers is not null and jsonb_typeof(p_quiz_answers) = 'array' then
    select count(*)::smallint,
           count(*) filter (
             where q.correct_index = (
               select (ans->>'a')::int
               from jsonb_array_elements(p_quiz_answers) ans
               where (ans->>'q') = q.id::text
               limit 1
             )
           )::smallint
    into v_total, v_correct
    from public.feedback_link_questions q
    where q.link_id = l.id;
    if v_total = 0 then
      v_total := null;
      v_correct := null;
    end if;
  end if;

  insert into public.instructor_feedback (
    org_id, department_id, link_id, source_type, source_id, instructor_id,
    kirkpatrick_level, rating_overall, rating_knowledge, rating_clarity,
    rating_engagement, rating_pace, would_recommend, comment, respondent_name,
    ip, user_agent, confidence_before, confidence_after, intent_to_apply,
    knowledge_correct, knowledge_total
  ) values (
    l.org_id, l.department_id, l.id, l.source_type, l.source_id, p_instructor_id,
    1, p_overall, p_knowledge, p_clarity, p_engagement, p_pace, p_recommend,
    left(p_comment, 2000), left(p_respondent_name, 120), p_ip, p_user_agent,
    p_confidence_before, p_confidence_after, p_intent_to_apply,
    v_correct, v_total
  );
end;
$$;

revoke execute on function public.submit_instructor_feedback(
  uuid, uuid, smallint, smallint, smallint, smallint, smallint, smallint, text, text, text, text,
  smallint, smallint, smallint, jsonb
) from public;
grant execute on function public.submit_instructor_feedback(
  uuid, uuid, smallint, smallint, smallint, smallint, smallint, smallint, text, text, text, text,
  smallint, smallint, smallint, jsonb
) to anon, authenticated, service_role;

-- ── Surface objective post-test results on the per-instructor view ────────────
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
  round(avg(f.intent_to_apply)::numeric, 2)            as intent_avg,
  count(*) filter (where f.knowledge_total is not null and f.knowledge_total > 0) as knowledge_responses,
  round(avg(
    case when f.knowledge_total is not null and f.knowledge_total > 0
         then (f.knowledge_correct::numeric / f.knowledge_total) * 100 end
  )::numeric, 0)                                       as knowledge_posttest_pct
from public.instructor_feedback f
group by f.org_id, f.department_id, f.instructor_id;

alter view public.v_instructor_quality set (security_invoker = true);
