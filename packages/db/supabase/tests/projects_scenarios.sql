-- Manual verification scenarios for the special-projects module (Prompt 6.1).
--
-- Run with:
--   supabase db execute --file packages/db/supabase/tests/projects_scenarios.sql

-- ── Scenario 1 ────────────────────────────────────────────────────────────────
-- task_assignments contribute to v_instructor_workload via Source 7
-- (project_task) only when project + task are still active.

do $$
declare
  v_org      uuid;
  v_inst     uuid;
  v_proj     uuid;
  v_task     uuid;
  v_member   uuid;
  v_count    integer;
begin
  select id into v_org from public.organizations limit 1;

  insert into public.instructors (org_id, full_name)
    values (v_org, 'PT Test Inst')
    returning id into v_inst;

  insert into public.projects (org_id, name, status)
    values (v_org, 'Project Workload Test '||gen_random_uuid(), 'active')
    returning id into v_proj;

  insert into public.project_team_members (org_id, project_id, instructor_id, role, allocated_hours)
    values (v_org, v_proj, v_inst, 'lead', 40)
    returning id into v_member;

  insert into public.tasks (org_id, project_id, name, status)
    values (v_org, v_proj, 'Active task', 'in_progress')
    returning id into v_task;

  insert into public.task_assignments (org_id, task_id, project_team_member_id, allocated_hours)
    values (v_org, v_task, v_member, 12);

  -- Active project + active task → should appear in workload
  select count(*) into v_count from public.v_instructor_workload
    where instructor_id = v_inst and source = 'project_task';
  if v_count <> 1 then
    raise exception 'Scenario 1 FAIL: expected 1 workload row for active project+task, got %', v_count;
  end if;

  -- Move task to 'completed' → should NOT appear
  update public.tasks set status = 'completed' where id = v_task;
  select count(*) into v_count from public.v_instructor_workload
    where instructor_id = v_inst and source = 'project_task';
  if v_count <> 0 then
    raise exception 'Scenario 1 FAIL: completed tasks should not contribute to workload, got %', v_count;
  end if;

  -- Reset to in_progress; move project to 'on_hold' → should NOT appear
  update public.tasks set status = 'in_progress' where id = v_task;
  update public.projects set status = 'on_hold' where id = v_proj;
  select count(*) into v_count from public.v_instructor_workload
    where instructor_id = v_inst and source = 'project_task';
  if v_count <> 0 then
    raise exception 'Scenario 1 FAIL: on_hold projects should not contribute to workload, got %', v_count;
  end if;

  raise notice 'Scenario 1 PASS: project_task workload only counts when project is planning/active and task is not_started/in_progress';

  delete from public.task_assignments where task_id = v_task;
  delete from public.tasks where id = v_task;
  delete from public.project_team_members where id = v_member;
  delete from public.projects where id = v_proj;
  delete from public.instructors where id = v_inst;
end $$;

-- ── Scenario 2 ────────────────────────────────────────────────────────────────
-- Action item completion timestamp is auto-set by the trigger when
-- is_complete flips true (and cleared when reset).

do $$
declare
  v_org    uuid;
  v_proj   uuid;
  v_task   uuid;
  v_item   uuid;
  v_done   timestamptz;
begin
  select id into v_org from public.organizations limit 1;

  insert into public.projects (org_id, name)
    values (v_org, 'AI Trigger Test '||gen_random_uuid())
    returning id into v_proj;

  insert into public.tasks (org_id, project_id, name)
    values (v_org, v_proj, 'Test task')
    returning id into v_task;

  -- New action item, not complete → completed_at should be null
  insert into public.task_action_items (org_id, task_id, description)
    values (v_org, v_task, 'Send invites')
    returning id into v_item;

  select completed_at into v_done from public.task_action_items where id = v_item;
  if v_done is not null then
    raise exception 'Scenario 2 FAIL: brand-new incomplete item should have null completed_at';
  end if;

  -- Mark complete → completed_at should be set
  update public.task_action_items set is_complete = true where id = v_item;
  select completed_at into v_done from public.task_action_items where id = v_item;
  if v_done is null then
    raise exception 'Scenario 2 FAIL: marking complete should set completed_at';
  end if;

  -- Unmark → completed_at should clear
  update public.task_action_items set is_complete = false where id = v_item;
  select completed_at into v_done from public.task_action_items where id = v_item;
  if v_done is not null then
    raise exception 'Scenario 2 FAIL: unmarking should clear completed_at';
  end if;

  raise notice 'Scenario 2 PASS: completed_at trigger sets/clears on is_complete flip';

  delete from public.task_action_items where task_id = v_task;
  delete from public.tasks where id = v_task;
  delete from public.projects where id = v_proj;
end $$;

-- ── Scenario 3 ────────────────────────────────────────────────────────────────
-- Unique constraint prevents the same instructor from being added to a
-- project twice, and the same team member from being assigned to a task twice.

do $$
declare
  v_org    uuid;
  v_inst   uuid;
  v_proj   uuid;
  v_task   uuid;
  v_member uuid;
  v_caught boolean;
begin
  select id into v_org from public.organizations limit 1;
  insert into public.instructors (org_id, full_name)
    values (v_org, 'Dup Test Inst')
    returning id into v_inst;
  insert into public.projects (org_id, name)
    values (v_org, 'Dup Test Proj '||gen_random_uuid())
    returning id into v_proj;
  insert into public.project_team_members (org_id, project_id, instructor_id)
    values (v_org, v_proj, v_inst)
    returning id into v_member;
  insert into public.tasks (org_id, project_id, name)
    values (v_org, v_proj, 'Dup task')
    returning id into v_task;

  -- Adding same instructor again should fail unique
  v_caught := false;
  begin
    insert into public.project_team_members (org_id, project_id, instructor_id)
      values (v_org, v_proj, v_inst);
  exception when unique_violation then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'Scenario 3 FAIL: expected unique violation on duplicate team member';
  end if;

  -- Same task assignment twice should fail unique
  insert into public.task_assignments (org_id, task_id, project_team_member_id, allocated_hours)
    values (v_org, v_task, v_member, 4);
  v_caught := false;
  begin
    insert into public.task_assignments (org_id, task_id, project_team_member_id, allocated_hours)
      values (v_org, v_task, v_member, 8);
  exception when unique_violation then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'Scenario 3 FAIL: expected unique violation on duplicate task assignment';
  end if;

  raise notice 'Scenario 3 PASS: unique constraints reject duplicate team members and task assignments';

  delete from public.task_assignments where task_id = v_task;
  delete from public.tasks where id = v_task;
  delete from public.project_team_members where project_id = v_proj;
  delete from public.projects where id = v_proj;
  delete from public.instructors where id = v_inst;
end $$;
