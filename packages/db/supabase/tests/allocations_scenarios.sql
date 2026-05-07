-- Manual verification scenarios for the Allocation system (Prompt 2.1).
--
-- Run with:
--   supabase db execute --file packages/db/supabase/tests/allocations_scenarios.sql
--
-- Each scenario is a self-contained do-block that creates fixtures, asserts
-- expected behavior, and cleans up. Raises an exception on failure.

-- ── Scenario 1 ────────────────────────────────────────────────────────────────
-- effective_allocation returns global when no overrides exist.

do $$
declare
  v_org uuid;
  v_inst uuid;
  v_b1 uuid; v_b2 uuid;
  v_global_b1 numeric; v_global_b2 numeric;
  v_eff record;
begin
  select id into v_org from public.organizations limit 1;

  insert into public.allocation_buckets (org_id, name) values (v_org, 'Test B1 '||gen_random_uuid()) returning id into v_b1;
  insert into public.allocation_buckets (org_id, name) values (v_org, 'Test B2 '||gen_random_uuid()) returning id into v_b2;
  insert into public.global_allocations (org_id, bucket_id, target_percent) values (v_org, v_b1, 70), (v_org, v_b2, 30);

  insert into public.instructors (org_id, full_name) values (v_org, 'Test Global-only Inst') returning id into v_inst;

  for v_eff in
    select * from public.effective_allocation(v_inst) order by bucket_id
  loop
    if v_eff.bucket_id = v_b1 then v_global_b1 := v_eff.target_percent; end if;
    if v_eff.bucket_id = v_b2 then v_global_b2 := v_eff.target_percent; end if;
    if v_eff.source <> 'global' then
      raise exception 'Scenario 1 FAIL: expected source=global, got % for bucket %', v_eff.source, v_eff.bucket_id;
    end if;
  end loop;

  if v_global_b1 <> 70 or v_global_b2 <> 30 then
    raise exception 'Scenario 1 FAIL: expected (70, 30), got (%, %)', v_global_b1, v_global_b2;
  end if;
  raise notice 'Scenario 1 PASS: effective_allocation returns global when no overrides';

  -- cleanup
  delete from public.instructors where id = v_inst;
  delete from public.global_allocations where bucket_id in (v_b1, v_b2);
  delete from public.allocation_buckets where id in (v_b1, v_b2);
end $$;

-- ── Scenario 2 ────────────────────────────────────────────────────────────────
-- Individual > Group > Global resolution.

do $$
declare
  v_org uuid;
  v_inst uuid;
  v_grp uuid;
  v_b1 uuid;
  v_individual numeric;
  v_eff record;
begin
  select id into v_org from public.organizations limit 1;
  insert into public.allocation_buckets (org_id, name) values (v_org, 'Test B '||gen_random_uuid()) returning id into v_b1;
  insert into public.global_allocations (org_id, bucket_id, target_percent) values (v_org, v_b1, 50);

  insert into public.allocation_groups (org_id, name) values (v_org, 'Test Group '||gen_random_uuid()) returning id into v_grp;
  insert into public.group_allocations (org_id, group_id, bucket_id, target_percent) values (v_org, v_grp, v_b1, 75);

  insert into public.instructors (org_id, full_name) values (v_org, 'Test Override Inst') returning id into v_inst;
  insert into public.allocation_group_members (group_id, instructor_id, org_id) values (v_grp, v_inst, v_org);

  -- Now override with an individual allocation
  insert into public.individual_allocations (org_id, instructor_id, bucket_id, target_percent) values (v_org, v_inst, v_b1, 90);

  select * into v_eff from public.effective_allocation(v_inst) where bucket_id = v_b1;

  if v_eff.source <> 'individual' or v_eff.target_percent <> 90 then
    raise exception 'Scenario 2 FAIL: expected (individual, 90), got (%, %)', v_eff.source, v_eff.target_percent;
  end if;

  -- Now drop the individual; expect group (75) to win
  delete from public.individual_allocations where instructor_id = v_inst and bucket_id = v_b1;
  select * into v_eff from public.effective_allocation(v_inst) where bucket_id = v_b1;
  if v_eff.source <> 'group' or v_eff.target_percent <> 75 then
    raise exception 'Scenario 2 FAIL: expected (group, 75), got (%, %)', v_eff.source, v_eff.target_percent;
  end if;

  -- Drop the group allocation; expect global (50) to win
  delete from public.group_allocations where group_id = v_grp and bucket_id = v_b1;
  select * into v_eff from public.effective_allocation(v_inst) where bucket_id = v_b1;
  if v_eff.source <> 'global' or v_eff.target_percent <> 50 then
    raise exception 'Scenario 2 FAIL: expected (global, 50), got (%, %)', v_eff.source, v_eff.target_percent;
  end if;

  raise notice 'Scenario 2 PASS: individual > group > global resolution';

  -- cleanup
  delete from public.allocation_group_members where group_id = v_grp;
  delete from public.allocation_groups where id = v_grp;
  delete from public.global_allocations where bucket_id = v_b1;
  delete from public.allocation_buckets where id = v_b1;
  delete from public.instructors where id = v_inst;
end $$;

-- ── Scenario 3 ────────────────────────────────────────────────────────────────
-- Multi-group instructor uses the most-recently-updated group.

do $$
declare
  v_org uuid;
  v_inst uuid;
  v_g_old uuid;
  v_g_new uuid;
  v_b1 uuid;
  v_eff record;
begin
  select id into v_org from public.organizations limit 1;
  insert into public.allocation_buckets (org_id, name) values (v_org, 'Test B '||gen_random_uuid()) returning id into v_b1;

  insert into public.allocation_groups (org_id, name) values (v_org, 'Old Group '||gen_random_uuid()) returning id into v_g_old;
  insert into public.allocation_groups (org_id, name) values (v_org, 'New Group '||gen_random_uuid()) returning id into v_g_new;

  insert into public.group_allocations (org_id, group_id, bucket_id, target_percent) values (v_org, v_g_old, v_b1, 40);
  insert into public.group_allocations (org_id, group_id, bucket_id, target_percent) values (v_org, v_g_new, v_b1, 60);

  -- Force v_g_new to be the more recently updated of the two
  update public.allocation_groups set updated_at = now() - interval '1 day' where id = v_g_old;
  update public.allocation_groups set updated_at = now() where id = v_g_new;

  insert into public.instructors (org_id, full_name) values (v_org, 'Test Multi-group Inst') returning id into v_inst;
  insert into public.allocation_group_members (group_id, instructor_id, org_id) values (v_g_old, v_inst, v_org), (v_g_new, v_inst, v_org);

  select * into v_eff from public.effective_allocation(v_inst) where bucket_id = v_b1;
  if v_eff.source <> 'group' or v_eff.target_percent <> 60 then
    raise exception 'Scenario 3 FAIL: expected (group, 60) from newer group, got (%, %)', v_eff.source, v_eff.target_percent;
  end if;

  -- Touch the older group so it becomes the most recent
  update public.allocation_groups set updated_at = now() + interval '1 minute' where id = v_g_old;

  select * into v_eff from public.effective_allocation(v_inst) where bucket_id = v_b1;
  if v_eff.source <> 'group' or v_eff.target_percent <> 40 then
    raise exception 'Scenario 3 FAIL: expected (group, 40) after touching older group, got (%, %)', v_eff.source, v_eff.target_percent;
  end if;

  raise notice 'Scenario 3 PASS: multi-group instructor uses most-recently-updated group';

  -- cleanup
  delete from public.allocation_group_members where instructor_id = v_inst;
  delete from public.allocation_groups where id in (v_g_old, v_g_new);
  delete from public.allocation_buckets where id = v_b1;
  delete from public.instructors where id = v_inst;
end $$;
