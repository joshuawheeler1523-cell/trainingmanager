-- Manual verification scenarios for TRAs (Prompt 4.1).
--
-- Run with:
--   supabase db execute --file packages/db/supabase/tests/tras_scenarios.sql
--
-- Each scenario is a self-contained do-block that creates fixtures, asserts
-- expected behavior, and cleans up. Raises an exception on failure.

-- ── Scenario 1 ────────────────────────────────────────────────────────────────
-- Catalog seed: 7 built-in deliverable_types with correct ratios.

do $$
declare
  v_count integer;
  v_ilt   numeric;
  v_l3    numeric;
begin
  select count(*) into v_count from public.deliverable_types where is_built_in = true;
  if v_count <> 7 then
    raise exception 'Scenario 1 FAIL: expected 7 built-in types, got %', v_count;
  end if;

  select dev_to_seat_ratio into v_ilt
    from public.deliverable_types where name = 'Instructor-Led Training' and is_built_in = true;
  if v_ilt <> 43 then
    raise exception 'Scenario 1 FAIL: ILT ratio expected 43, got %', v_ilt;
  end if;

  select dev_to_seat_ratio into v_l3
    from public.deliverable_types where name = 'Self-Paced eLearning (Level 3)' and is_built_in = true;
  if v_l3 <> 490 then
    raise exception 'Scenario 1 FAIL: L3 eLearning ratio expected 490, got %', v_l3;
  end if;

  raise notice 'Scenario 1 PASS: 7 built-in deliverable_types seeded with correct ratios';
end $$;

-- ── Scenario 2 ────────────────────────────────────────────────────────────────
-- BEFORE trigger computes estimated_hours from the deliverable_type's ratio.
-- ILT: 1 hr seat-time × 43 ratio × quantity 2 × multiplier 1.0 = 86 hrs.

do $$
declare
  v_org uuid;
  v_tra uuid;
  v_type uuid;
  v_del uuid;
  v_estimated numeric;
begin
  select id into v_org from public.organizations limit 1;

  insert into public.tras (org_id, project_name, urgency)
    values (v_org, 'Test TRA '||gen_random_uuid(), 'standard')
    returning id into v_tra;

  select id into v_type from public.deliverable_types
    where name = 'Instructor-Led Training' and is_built_in = true;

  insert into public.tra_deliverables (org_id, tra_id, deliverable_type_id, name, seat_time_hours, quantity, complexity_multiplier)
    values (v_org, v_tra, v_type, 'ILT Module', 1, 2, 1.0)
    returning id, estimated_hours into v_del, v_estimated;

  if v_estimated <> 86 then
    raise exception 'Scenario 2 FAIL: expected 86 hrs (1 × 43 × 2 × 1.0), got %', v_estimated;
  end if;

  raise notice 'Scenario 2 PASS: BEFORE trigger computed estimated_hours correctly (86 hrs)';

  delete from public.tra_deliverables where id = v_del;
  delete from public.tras where id = v_tra;
end $$;

-- ── Scenario 3 ────────────────────────────────────────────────────────────────
-- AFTER trigger updates tras.total_estimated_hours when deliverables change.
-- Add two deliverables totaling 100 hrs; remove one; expect total = 50.

do $$
declare
  v_org uuid;
  v_tra uuid;
  v_type uuid;
  v_d1 uuid; v_d2 uuid;
  v_total_after_two numeric;
  v_total_after_one numeric;
begin
  select id into v_org from public.organizations limit 1;
  select id into v_type from public.deliverable_types
    where name = 'Job Aid' and is_built_in = true; -- ratio = 12

  insert into public.tras (org_id, project_name) values (v_org, 'Test Total '||gen_random_uuid())
    returning id into v_tra;

  -- Job Aid 2hrs × 12 × 1 × 1.0 = 24, plus another 2 × 12 × 2 × 1.0 = 48 → total 72
  insert into public.tra_deliverables (org_id, tra_id, deliverable_type_id, name, seat_time_hours, quantity)
    values (v_org, v_tra, v_type, 'JA1', 2, 1) returning id into v_d1;
  insert into public.tra_deliverables (org_id, tra_id, deliverable_type_id, name, seat_time_hours, quantity)
    values (v_org, v_tra, v_type, 'JA2', 2, 2) returning id into v_d2;

  select total_estimated_hours into v_total_after_two from public.tras where id = v_tra;
  if v_total_after_two <> 72 then
    raise exception 'Scenario 3 FAIL (after add): expected 72, got %', v_total_after_two;
  end if;

  -- Remove one
  delete from public.tra_deliverables where id = v_d2;
  select total_estimated_hours into v_total_after_one from public.tras where id = v_tra;
  if v_total_after_one <> 24 then
    raise exception 'Scenario 3 FAIL (after delete): expected 24, got %', v_total_after_one;
  end if;

  raise notice 'Scenario 3 PASS: tras.total_estimated_hours rolled up correctly (72 then 24)';

  delete from public.tra_deliverables where tra_id = v_tra;
  delete from public.tras where id = v_tra;
end $$;

-- ── Scenario 4 ────────────────────────────────────────────────────────────────
-- Conversion produces a project + one task per deliverable (DOD).
-- This scenario exercises the SQL state changes; the full conversion is
-- triggered via the convertTraToProject server action in the app, but the
-- shape it produces is what we verify here.

do $$
declare
  v_org uuid;
  v_tra uuid;
  v_type uuid;
  v_proj uuid;
  v_task_count integer;
  v_tra_status text;
begin
  select id into v_org from public.organizations limit 1;
  select id into v_type from public.deliverable_types
    where name = 'Microlearning' and is_built_in = true; -- ratio = 35

  insert into public.tras (org_id, project_name, urgency, status)
    values (v_org, 'Test Convert '||gen_random_uuid(), 'high', 'approved')
    returning id into v_tra;

  insert into public.tra_deliverables (org_id, tra_id, deliverable_type_id, name, seat_time_hours, quantity)
    values
      (v_org, v_tra, v_type, 'Lesson 1', 0.25, 1),
      (v_org, v_tra, v_type, 'Lesson 2', 0.25, 1),
      (v_org, v_tra, v_type, 'Lesson 3', 0.25, 1);

  -- Simulate the conversion: insert project + tasks + flip TRA status
  insert into public.projects (org_id, name, priority, status, total_estimated_hours, source_tra_id)
    select v_org, project_name, 'high', 'planning', total_estimated_hours, v_tra
    from public.tras where id = v_tra
    returning id into v_proj;

  insert into public.tasks (org_id, project_id, name, estimated_hours, sort_order)
    select v_org, v_proj, name, estimated_hours, row_number() over (order by created_at) - 1
    from public.tra_deliverables where tra_id = v_tra;

  update public.tras set status = 'converted', converted_to_project_id = v_proj where id = v_tra;

  -- Assertions
  select count(*) into v_task_count from public.tasks where project_id = v_proj;
  if v_task_count <> 3 then
    raise exception 'Scenario 4 FAIL: expected 3 tasks, got %', v_task_count;
  end if;

  select status into v_tra_status from public.tras where id = v_tra;
  if v_tra_status <> 'converted' then
    raise exception 'Scenario 4 FAIL: expected status=converted, got %', v_tra_status;
  end if;

  raise notice 'Scenario 4 PASS: conversion produced project + 3 tasks; TRA marked converted';

  delete from public.tasks where project_id = v_proj;
  delete from public.projects where id = v_proj;
  delete from public.tra_deliverables where tra_id = v_tra;
  delete from public.tras where id = v_tra;
end $$;
