-- Phase 6.3 — external dependencies + public share token + transactional import.
--
-- Run with:
--   supabase db execute --file packages/db/supabase/tests/external_deps_and_share_scenarios.sql

-- ── Scenario 1 ───────────────────────────────────────────────────────────────
-- External dependency resolved_at is auto-stamped by the trigger when status
-- flips to 'resolved' (and cleared when status flips away).

do $$
declare
  v_org   uuid;
  v_proj  uuid;
  v_dep   uuid;
  v_resolved timestamptz;
begin
  select id into v_org from public.organizations limit 1;
  insert into public.projects (org_id, name)
    values (v_org, 'Dep Trigger Test '||gen_random_uuid())
    returning id into v_proj;

  insert into public.dependencies (org_id, project_id, name, dep_type)
    values (v_org, v_proj, 'Vendor sign-off', 'vendor')
    returning id into v_dep;

  select resolved_at into v_resolved from public.dependencies where id = v_dep;
  if v_resolved is not null then
    raise exception 'Scenario 1 FAIL: brand-new open dependency should have null resolved_at';
  end if;

  update public.dependencies set status = 'resolved' where id = v_dep;
  select resolved_at into v_resolved from public.dependencies where id = v_dep;
  if v_resolved is null then
    raise exception 'Scenario 1 FAIL: status=resolved should set resolved_at';
  end if;

  update public.dependencies set status = 'open' where id = v_dep;
  select resolved_at into v_resolved from public.dependencies where id = v_dep;
  if v_resolved is not null then
    raise exception 'Scenario 1 FAIL: reopening should clear resolved_at';
  end if;

  raise notice 'Scenario 1 PASS: dependency resolved_at trigger sets/clears correctly';

  delete from public.dependencies where id = v_dep;
  delete from public.projects where id = v_proj;
end $$;

-- ── Scenario 2 ───────────────────────────────────────────────────────────────
-- Public-share read works only when the share token session var matches the
-- project's public_share_token. Without the var the policy denies anon
-- reads even when the row exists.

do $$
declare
  v_org   uuid;
  v_proj  uuid;
  v_token uuid := gen_random_uuid();
  v_count integer;
begin
  select id into v_org from public.organizations limit 1;
  insert into public.projects (org_id, name, public_share_token)
    values (v_org, 'Share Test '||gen_random_uuid(), v_token)
    returning id into v_proj;
  insert into public.tasks (org_id, project_id, name)
    values (v_org, v_proj, 'Public task');

  -- Simulate an anon caller: switch role + clear the share token.
  set local role anon;
  perform set_config('request.share_token', '', true);
  select count(*) into v_count from public.tasks where project_id = v_proj;
  if v_count <> 0 then
    raise exception 'Scenario 2 FAIL: anon without token should see 0 tasks, got %', v_count;
  end if;

  -- Set the share token; anon should now see the task.
  perform set_config('request.share_token', v_token::text, true);
  select count(*) into v_count from public.tasks where project_id = v_proj;
  if v_count <> 1 then
    raise exception 'Scenario 2 FAIL: anon with matching token should see 1 task, got %', v_count;
  end if;

  -- Wrong token → no access.
  perform set_config('request.share_token', gen_random_uuid()::text, true);
  select count(*) into v_count from public.tasks where project_id = v_proj;
  if v_count <> 0 then
    raise exception 'Scenario 2 FAIL: anon with wrong token should see 0 tasks, got %', v_count;
  end if;

  -- Reset role + clean up
  reset role;
  delete from public.tasks where project_id = v_proj;
  delete from public.projects where id = v_proj;

  raise notice 'Scenario 2 PASS: public-share RLS gates anon reads on matching share token';
end $$;

-- ── Scenario 3 ───────────────────────────────────────────────────────────────
-- import_tasks() is transactional. A bad row in the middle of a batch must
-- abort all earlier mutations, not partially apply them.

do $$
declare
  v_org   uuid;
  v_proj  uuid;
  v_count integer;
  v_caught boolean;
begin
  select id into v_org from public.organizations limit 1;
  insert into public.projects (org_id, name)
    values (v_org, 'Import Test '||gen_random_uuid())
    returning id into v_proj;

  -- Two valid inserts plus a bad one (invalid status enum) → whole batch aborts.
  v_caught := false;
  begin
    perform public.import_tasks(
      v_proj,
      jsonb_build_array(
        jsonb_build_object('name', 'Good 1', 'status', 'not_started'),
        jsonb_build_object('name', 'Good 2', 'status', 'in_progress'),
        jsonb_build_object('name', 'Bad',     'status', 'wat')
      ),
      '[]'::jsonb,
      ARRAY[]::uuid[]
    );
  exception when others then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'Scenario 3 FAIL: bad status should abort the batch';
  end if;

  select count(*) into v_count from public.tasks where project_id = v_proj;
  if v_count <> 0 then
    raise exception 'Scenario 3 FAIL: aborted batch should leave 0 tasks, got %', v_count;
  end if;

  raise notice 'Scenario 3 PASS: import_tasks aborts the whole batch on a single bad row';

  delete from public.projects where id = v_proj;
end $$;
