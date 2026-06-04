-- =============================================================================
-- Raise the anonymous-feedback rate limit for in-room / shared-Wi-Fi use.
-- =============================================================================
-- The original guard capped submissions at 5 per (link, ip) per hour to deter
-- ballot-stuffing. But a class scanning the same QR from one hospital Wi-Fi
-- network all shares a single NAT public IP, and a co-taught session writes one
-- row PER instructor — so a real classroom blew past 5 instantly.
--
-- IP-based limiting can't tell a 40-person classroom apart from one abuser
-- behind the same NAT, so we raise the ceiling to a class-realistic number that
-- legitimate use will never reach, while still backstopping a runaway script
-- (and the UI already blocks casual double-submits; a manager can deactivate a
-- link if a single code is being abused). Signature unchanged → grants persist.
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

  -- Backstop against a runaway script only; sized so a real (even co-taught,
  -- shared-Wi-Fi) classroom never reaches it.
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
    rating_engagement, rating_pace, would_recommend, comment, respondent_name, ip, user_agent
  ) values (
    l.org_id, l.department_id, l.id, l.source_type, l.source_id, p_instructor_id,
    1, p_overall, p_knowledge, p_clarity, p_engagement, p_pace, p_recommend,
    left(p_comment, 2000), left(p_respondent_name, 120), p_ip, p_user_agent
  );
end;
$$;
