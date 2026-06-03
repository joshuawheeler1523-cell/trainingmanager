-- =============================================================================
-- Instructor Quality — Kirkpatrick-shaped quality tracking per instructor
-- =============================================================================
-- L1 (Reaction): anonymous learner feedback collected via per-deliverable QR
--   links, attributed to the instructor the learner picks.
-- L2-L4 (Learning / Behavior / Results): manager-entered scores.
-- "Deliverables" span ALL instructor work via v_instructor_workload's
--   source/source_id (class, recurring_task, ad_hoc_task, education_request,
--   project_task), so quality rolls up across an instructor's whole mix.
-- Anonymous capture reuses the proven public-intake anon-RLS pattern.
-- =============================================================================

-- ── 1. Token-gated feedback links (one QR per deliverable) ───────────────────
create table public.instructor_feedback_links (
  id            uuid        not null default gen_random_uuid() primary key,
  org_id        uuid        not null references public.organizations(id) on delete cascade,
  department_id uuid        not null references public.departments(id) on delete cascade,
  token         uuid        not null unique default gen_random_uuid(),
  source_type   text        not null check (source_type in
                  ('class','recurring_task','ad_hoc_task','education_request','project_task')),
  source_id     uuid        not null,
  label         text,
  is_active     boolean     not null default true,
  expires_at    timestamptz,
  created_by    uuid        references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index instructor_feedback_links_deliverable_unique
  on public.instructor_feedback_links (org_id, source_type, source_id);
create index on public.instructor_feedback_links (department_id);
create index on public.instructor_feedback_links (token);

alter table public.instructor_feedback_links enable row level security;
create policy "ifl_select_internal" on public.instructor_feedback_links
  for select using (org_id in (select public.user_org_ids()));
create policy "ifl_modify_internal" on public.instructor_feedback_links
  for all using (org_id in (select public.user_org_ids()));
-- Anon may read an active, unexpired link so the public form can render.
create policy "ifl_select_public_anon" on public.instructor_feedback_links
  for select to anon
  using (is_active = true and (expires_at is null or expires_at > now()));

select public.apply_standard_triggers('instructor_feedback_links');

-- ── 2. L1 reaction responses (anonymous, append-only) ────────────────────────
create table public.instructor_feedback (
  id                uuid        not null default gen_random_uuid() primary key,
  org_id            uuid        not null references public.organizations(id) on delete cascade,
  department_id     uuid        not null references public.departments(id) on delete cascade,
  link_id           uuid        not null references public.instructor_feedback_links(id) on delete cascade,
  source_type       text        not null,
  source_id         uuid        not null,
  instructor_id     uuid        not null references public.instructors(id) on delete cascade,
  kirkpatrick_level smallint    not null default 1 check (kirkpatrick_level = 1),
  rating_knowledge  smallint    check (rating_knowledge between 1 and 5),
  rating_clarity    smallint    check (rating_clarity between 1 and 5),
  rating_engagement smallint    check (rating_engagement between 1 and 5),
  rating_pace       smallint    check (rating_pace between 1 and 5),
  rating_overall    smallint    check (rating_overall between 1 and 5),
  would_recommend   smallint    check (would_recommend between 0 and 10),
  comment           text,
  respondent_name   text,
  ip                text,
  user_agent        text,
  submitted_at      timestamptz not null default now()
);
create index on public.instructor_feedback (org_id, instructor_id);
create index on public.instructor_feedback (department_id, instructor_id);
create index on public.instructor_feedback (link_id);

alter table public.instructor_feedback enable row level security;
create policy "if_select_internal" on public.instructor_feedback
  for select using (org_id in (select public.user_org_ids()));
-- Anon may INSERT a reaction tied to a valid active link in the same
-- org/department/deliverable. anon can't read responses back.
create policy "if_insert_public_anon" on public.instructor_feedback
  for insert to anon
  with check (
    kirkpatrick_level = 1
    and exists (
      select 1 from public.instructor_feedback_links l
      where l.id = instructor_feedback.link_id
        and l.org_id = instructor_feedback.org_id
        and l.department_id = instructor_feedback.department_id
        and l.source_type = instructor_feedback.source_type
        and l.source_id = instructor_feedback.source_id
        and l.is_active = true
        and (l.expires_at is null or l.expires_at > now())
    )
  );

-- ── 3. Manager-entered L2-L4 scores ──────────────────────────────────────────
create table public.instructor_quality_scores (
  id                uuid         not null default gen_random_uuid() primary key,
  org_id            uuid         not null references public.organizations(id) on delete cascade,
  department_id     uuid         not null references public.departments(id) on delete cascade,
  instructor_id     uuid         not null references public.instructors(id) on delete cascade,
  kirkpatrick_level smallint     not null check (kirkpatrick_level in (2,3,4)),
  metric            text         not null,
  score             numeric(6,2) not null check (score >= 0),
  score_max         numeric(6,2) not null default 100 check (score_max > 0),
  period_label      text,
  note              text,
  source_type       text,
  source_id         uuid,
  recorded_by       uuid         references auth.users(id) on delete set null,
  recorded_at       timestamptz  not null default now(),
  created_at        timestamptz  not null default now(),
  updated_at        timestamptz  not null default now()
);
create index on public.instructor_quality_scores (org_id, instructor_id, kirkpatrick_level);
create index on public.instructor_quality_scores (department_id, instructor_id);

alter table public.instructor_quality_scores enable row level security;
create policy "iqs_select_internal" on public.instructor_quality_scores
  for select using (org_id in (select public.user_org_ids()));
create policy "iqs_modify_manager" on public.instructor_quality_scores
  for all using (public.is_manager(org_id));

select public.apply_standard_triggers('instructor_quality_scores');

-- ── 4. Per-instructor L1 aggregate view ──────────────────────────────────────
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
  count(f.would_recommend)                              as nps_responses,
  count(*) filter (where f.would_recommend >= 9)        as promoters,
  count(*) filter (where f.would_recommend is not null and f.would_recommend <= 6) as detractors,
  case when count(f.would_recommend) > 0 then
    round(((count(*) filter (where f.would_recommend >= 9)
            - count(*) filter (where f.would_recommend is not null and f.would_recommend <= 6))::numeric
           / count(f.would_recommend)) * 100, 0)
  else null end                                         as nps
from public.instructor_feedback f
group by f.org_id, f.department_id, f.instructor_id;

alter view public.v_instructor_quality set (security_invoker = true);

-- ── 5. Token-gated context for the public form ───────────────────────────────
-- Returns the deliverable label + eligible instructors (from the unified
-- workload view) so the learner can pick who they're rating. SECURITY DEFINER
-- so anon resolves without table grants; gated strictly by a valid token.
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
