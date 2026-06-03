-- =============================================================================
-- Harden the public instructor-feedback surface (security review remediations)
-- =============================================================================
-- Findings addressed:
--  • Anon could enumerate every org's active feedback links (token, org,
--    department, source_type, source_id, label) — cross-tenant disclosure +
--    bulk token harvesting.
--  • Instructor-on-deliverable eligibility was enforced only in the app action;
--    a direct PostgREST insert could attribute feedback to any instructor.
--  • No rate limiting on anonymous submissions (ballot-stuffing).
--  • Link create/toggle was plain org-member, not manager.
-- Fix: route all anon writes through ONE token-gated SECURITY DEFINER RPC that
-- derives every tenant column from the resolved link and verifies the
-- instructor; revoke the open anon insert + broad anon select; manager-gate
-- link management.
-- =============================================================================

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

  -- Light anti-ballot-stuffing: ≤5 submissions per (link, ip) per hour.
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

-- Close the direct anon insert and the enumerable anon link SELECT. Anon now
-- reads links ONLY through the token-gated feedback_link_context RPC.
drop policy if exists "if_insert_public_anon" on public.instructor_feedback;
revoke insert on public.instructor_feedback from anon;

drop policy if exists "ifl_select_public_anon" on public.instructor_feedback_links;
revoke select on public.instructor_feedback_links from anon;

-- Manager-gate link management at the DB layer (was plain org membership).
-- Keep ifl_select_internal so non-managers can still view links on the page.
drop policy if exists "ifl_modify_internal" on public.instructor_feedback_links;
create policy "ifl_modify_manager" on public.instructor_feedback_links
  for all using (public.is_manager(org_id)) with check (public.is_manager(org_id));
