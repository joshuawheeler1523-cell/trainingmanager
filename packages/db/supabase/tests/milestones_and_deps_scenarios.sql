-- Manual verification scenarios for Phase 6.2 — milestones + task dependencies.
--
-- Run with:
--   supabase db execute --file packages/db/supabase/tests/milestones_and_deps_scenarios.sql

-- ── Scenario 1 ───────────────────────────────────────────────────────────────
-- task_dependencies cycle prevention. Adding A→B is fine, B→A should be
-- rejected by the BEFORE INSERT trigger.

do $$
declare
  v_org   uuid;
  v_proj  uuid;
  v_a     uuid;
  v_b     uuid;
  v_caught boolean;
begin
  select id into v_org from public.organizations limit 1;

  insert into public.projects (org_id, name)
    values (v_org, 'Cycle Test Proj '||gen_random_uuid())
    returning id into v_proj;

  insert into public.tasks (org_id, project_id, name)
    values (v_org, v_proj, 'A') returning id into v_a;
  insert into public.tasks (org_id, project_id, name)
    values (v_org, v_proj, 'B') returning id into v_b;

  insert into public.task_dependencies (org_id, predecessor_id, successor_id)
    values (v_org, v_a, v_b);

  v_caught := false;
  begin
    insert into public.task_dependencies (org_id, predecessor_id, successor_id)
      values (v_org, v_b, v_a);
  exception when check_violation then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'Scenario 1 FAIL: cycle B→A should be rejected when A→B exists';
  end if;

  raise notice 'Scenario 1 PASS: cycle prevention trigger rejects B→A given A→B';

  delete from public.task_dependencies where predecessor_id = v_a;
  delete from public.tasks where project_id = v_proj;
  delete from public.projects where id = v_proj;
end $$;

-- ── Scenario 2 ───────────────────────────────────────────────────────────────
-- Self-dependency is rejected by the CHECK constraint (not the cycle trigger).

do $$
declare
  v_org   uuid;
  v_proj  uuid;
  v_a     uuid;
  v_caught boolean;
begin
  select id into v_org from public.organizations limit 1;
  insert into public.projects (org_id, name)
    values (v_org, 'Self Dep Test '||gen_random_uuid())
    returning id into v_proj;
  insert into public.tasks (org_id, project_id, name)
    values (v_org, v_proj, 'Solo') returning id into v_a;

  v_caught := false;
  begin
    insert into public.task_dependencies (org_id, predecessor_id, successor_id)
      values (v_org, v_a, v_a);
  exception when check_violation then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'Scenario 2 FAIL: self-dependency should be rejected';
  end if;

  raise notice 'Scenario 2 PASS: self-dependency rejected by CHECK constraint';

  delete from public.tasks where id = v_a;
  delete from public.projects where id = v_proj;
end $$;

-- ── Scenario 3 ───────────────────────────────────────────────────────────────
-- Milestone completed_at trigger sets/clears on is_complete flip.

do $$
declare
  v_org   uuid;
  v_proj  uuid;
  v_ms    uuid;
  v_done  timestamptz;
begin
  select id into v_org from public.organizations limit 1;
  insert into public.projects (org_id, name)
    values (v_org, 'Milestone Trigger Test '||gen_random_uuid())
    returning id into v_proj;

  insert into public.milestones (org_id, project_id, name, due_date)
    values (v_org, v_proj, 'Pilot kickoff', current_date + 14)
    returning id into v_ms;

  select completed_at into v_done from public.milestones where id = v_ms;
  if v_done is not null then
    raise exception 'Scenario 3 FAIL: brand-new milestone should have null completed_at';
  end if;

  update public.milestones set is_complete = true where id = v_ms;
  select completed_at into v_done from public.milestones where id = v_ms;
  if v_done is null then
    raise exception 'Scenario 3 FAIL: marking complete should set completed_at';
  end if;

  update public.milestones set is_complete = false where id = v_ms;
  select completed_at into v_done from public.milestones where id = v_ms;
  if v_done is not null then
    raise exception 'Scenario 3 FAIL: unmarking should clear completed_at';
  end if;

  raise notice 'Scenario 3 PASS: milestone completed_at trigger sets/clears on flip';

  delete from public.milestones where id = v_ms;
  delete from public.projects where id = v_proj;
end $$;

-- ── Scenario 4 ───────────────────────────────────────────────────────────────
-- Tasks can reference a milestone, and dropping the milestone clears the FK
-- (ON DELETE SET NULL) without cascading the task.

do $$
declare
  v_org   uuid;
  v_proj  uuid;
  v_ms    uuid;
  v_t     uuid;
  v_link  uuid;
begin
  select id into v_org from public.organizations limit 1;
  insert into public.projects (org_id, name)
    values (v_org, 'Milestone FK Test '||gen_random_uuid())
    returning id into v_proj;
  insert into public.milestones (org_id, project_id, name, due_date)
    values (v_org, v_proj, 'M1', current_date + 7)
    returning id into v_ms;
  insert into public.tasks (org_id, project_id, name, milestone_id)
    values (v_org, v_proj, 'T1', v_ms)
    returning id into v_t;

  select milestone_id into v_link from public.tasks where id = v_t;
  if v_link is null then
    raise exception 'Scenario 4 FAIL: task should reference milestone after insert';
  end if;

  delete from public.milestones where id = v_ms;
  select milestone_id into v_link from public.tasks where id = v_t;
  if v_link is not null then
    raise exception 'Scenario 4 FAIL: task.milestone_id should clear on milestone delete';
  end if;

  raise notice 'Scenario 4 PASS: task.milestone_id clears via ON DELETE SET NULL';

  delete from public.tasks where id = v_t;
  delete from public.projects where id = v_proj;
end $$;
