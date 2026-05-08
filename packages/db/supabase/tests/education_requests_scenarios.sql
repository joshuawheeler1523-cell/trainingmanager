-- Manual verification scenarios for education requests (Prompt 5.1).
--
-- Run with:
--   supabase db execute --file packages/db/supabase/tests/education_requests_scenarios.sql

-- ── Scenario 1 ────────────────────────────────────────────────────────────────
-- Status-change trigger writes a history row on INSERT and on every UPDATE
-- where status actually changed.

do $$
declare
  v_org uuid;
  v_request uuid;
  v_count integer;
  v_history record;
begin
  select id into v_org from public.organizations limit 1;

  insert into public.education_requests (org_id, title, requested_by_name, urgency)
    values (v_org, 'Test History '||gen_random_uuid(), 'Tester', 'standard')
    returning id into v_request;

  -- Should have one history row (the initial 'new' status)
  select count(*) into v_count from public.education_request_history where request_id = v_request;
  if v_count <> 1 then
    raise exception 'Scenario 1 FAIL: expected 1 history row after insert, got %', v_count;
  end if;

  select * into v_history from public.education_request_history
    where request_id = v_request order by occurred_at desc limit 1;
  if v_history.from_status is not null or v_history.to_status <> 'new' then
    raise exception 'Scenario 1 FAIL: initial history should be (null → new), got (% → %)',
      v_history.from_status, v_history.to_status;
  end if;

  -- Move through the workflow
  update public.education_requests set status = 'under_review' where id = v_request;
  update public.education_requests set status = 'approved' where id = v_request;
  -- A no-op update (same status) should NOT add a history row
  update public.education_requests set review_notes = 'looks good' where id = v_request;

  select count(*) into v_count from public.education_request_history where request_id = v_request;
  if v_count <> 3 then
    raise exception 'Scenario 1 FAIL: expected 3 history rows (new + under_review + approved), got %', v_count;
  end if;

  raise notice 'Scenario 1 PASS: status-change trigger writes history on INSERT and on real status changes only';

  delete from public.education_requests where id = v_request;
end $$;

-- ── Scenario 2 ────────────────────────────────────────────────────────────────
-- Education request assignments contribute to v_instructor_workload exactly
-- when status is approved/assigned/in_progress.

do $$
declare
  v_org uuid;
  v_inst uuid;
  v_request uuid;
  v_workload_count integer;
begin
  select id into v_org from public.organizations limit 1;
  insert into public.instructors (org_id, full_name) values (v_org, 'Test Workload Inst')
    returning id into v_inst;

  insert into public.education_requests (org_id, title, requested_by_name, status)
    values (v_org, 'Test Workload '||gen_random_uuid(), 'Tester', 'approved')
    returning id into v_request;

  insert into public.education_request_assignments (org_id, request_id, instructor_id, estimated_hours)
    values (v_org, v_request, v_inst, 12);

  -- Approved → should appear in workload
  select count(*) into v_workload_count from public.v_instructor_workload
    where instructor_id = v_inst and source = 'education_request';
  if v_workload_count <> 1 then
    raise exception 'Scenario 2 FAIL: expected 1 workload row when approved, got %', v_workload_count;
  end if;

  -- Move to assigned → still appears
  update public.education_requests set status = 'assigned' where id = v_request;
  select count(*) into v_workload_count from public.v_instructor_workload
    where instructor_id = v_inst and source = 'education_request';
  if v_workload_count <> 1 then
    raise exception 'Scenario 2 FAIL: expected 1 workload row when assigned, got %', v_workload_count;
  end if;

  -- Move to completed → should NOT appear
  update public.education_requests set status = 'completed' where id = v_request;
  select count(*) into v_workload_count from public.v_instructor_workload
    where instructor_id = v_inst and source = 'education_request';
  if v_workload_count <> 0 then
    raise exception 'Scenario 2 FAIL: completed requests should not contribute to workload, got %', v_workload_count;
  end if;

  raise notice 'Scenario 2 PASS: education_request workload only counts approved/assigned/in_progress';

  delete from public.education_request_assignments where request_id = v_request;
  delete from public.education_requests where id = v_request;
  delete from public.instructors where id = v_inst;
end $$;

-- ── Scenario 3 ────────────────────────────────────────────────────────────────
-- Aging notification job creates exactly one notification per stale request
-- per day (no duplicates).

do $$
declare
  v_org uuid;
  v_user uuid;
  v_request uuid;
  v_notif_count integer;
begin
  select id into v_org from public.organizations limit 1;
  select user_id into v_user from public.org_memberships
    where org_id = v_org and accepted_at is not null limit 1;
  if v_user is null then
    raise exception 'Scenario 3 SETUP: no accepted org member found in org %', v_org;
  end if;

  -- Insert a request created 7 days ago, still in 'new' status, with created_by
  insert into public.education_requests (org_id, title, requested_by_name, status, created_by, created_at, updated_at)
    values (v_org, 'Test Aging '||gen_random_uuid(), 'Tester', 'new', v_user, now() - interval '7 days', now() - interval '7 days')
    returning id into v_request;

  perform public.notify_aging_requests();

  select count(*) into v_notif_count from public.notifications
    where recipient_id = v_user
      and kind = 'request_aging'
      and link = format('/request-queue?focus=%s', v_request)
      and created_at >= current_date;

  if v_notif_count = 0 then
    raise exception 'Scenario 3 FAIL: expected at least 1 aging notification, got 0';
  end if;

  -- Run again — should NOT duplicate
  perform public.notify_aging_requests();
  select count(*) into v_notif_count from public.notifications
    where recipient_id = v_user
      and kind = 'request_aging'
      and link = format('/request-queue?focus=%s', v_request)
      and created_at >= current_date;
  if v_notif_count <> 1 then
    raise exception 'Scenario 3 FAIL: aging job should be idempotent within a day, got % notifications', v_notif_count;
  end if;

  raise notice 'Scenario 3 PASS: aging job creates one notification per stale request per day';

  delete from public.notifications where recipient_id = v_user and kind = 'request_aging' and link = format('/request-queue?focus=%s', v_request);
  delete from public.education_requests where id = v_request;
end $$;
