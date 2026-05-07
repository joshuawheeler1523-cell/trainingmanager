-- Manual verification scenarios for the workload engine (Prompt 3.1).
--
-- Run with:
--   supabase db execute --file packages/db/supabase/tests/workload_scenarios.sql
--
-- Each scenario is a self-contained do-block that creates fixtures, asserts
-- expected behavior, and cleans up. Raises an exception on failure.
--
-- DOD coverage status:
--   1. Single class + single instructor (204h / 10.85% utilization)   — Scenario 1
--   2. Multi-day class with custom day hours                          — Scenario 2
--   3. Recurring task with custom occurrences override                — Scenario 3
--   4. Project commitment + project task                              — DEFERRED
--      (projects/tasks tables ship in Phase 9; CREATE OR REPLACE VIEW
--      will add their branches and the workload contract is unchanged)
--   5. Ad-hoc task in `done` excluded                                 — Scenario 4
--   6. Soft-deleted class excluded                                    — Scenario 5

-- ── Scenario 1 ────────────────────────────────────────────────────────────────
-- Instructor with: 1 class (10 offerings × 8h instruction + 1h prep + 1h
-- logistics = 100 annual hrs), 1 weekly recurring task (2h × 52 = 104 annual
-- hrs). Total assigned_hours = 204; utilization_pct ≈ 10.85.

do $$
declare
  v_org uuid;
  v_inst uuid;
  v_class uuid;
  v_rt uuid;
  v_assigned numeric;
  v_util numeric;
  v_class_total numeric;
  v_rt_total numeric;
begin
  select id into v_org from public.organizations limit 1;

  insert into public.instructors (org_id, full_name, annual_hours)
    values (v_org, 'Test 204h Inst', 1880)
    returning id into v_inst;

  insert into public.classes (
    org_id, name, hours_per_day, total_days,
    prep_hours_per_offering, logistics_hours_per_offering, offerings_per_year
  ) values (v_org, 'Test Class '||gen_random_uuid(), 8, 1, 1, 1, 10)
    returning id into v_class;

  insert into public.class_instructor_assignments (
    org_id, class_id, instructor_id, role, assigned_offerings
  ) values (v_org, v_class, v_inst, 'primary', 10);

  insert into public.recurring_tasks (
    org_id, name, hours_per_occurrence, frequency
  ) values (v_org, 'Test Weekly '||gen_random_uuid(), 2, 'weekly')
    returning id into v_rt;

  insert into public.recurring_task_assignments (
    org_id, recurring_task_id, instructor_id, share_percent
  ) values (v_org, v_rt, v_inst, 100);

  -- assigned_hours from the capacity view
  select assigned_hours, utilization_pct
    into v_assigned, v_util
    from public.v_instructor_capacity
    where instructor_id = v_inst;

  if v_assigned <> 204 then
    raise exception 'Scenario 1 FAIL: expected assigned_hours=204, got %', v_assigned;
  end if;
  if round(v_util::numeric, 2) <> 10.85 then
    raise exception 'Scenario 1 FAIL: expected utilization_pct≈10.85, got %', v_util;
  end if;

  -- per-source breakdown via v_instructor_workload
  select sum(annual_hours) into v_class_total
    from public.v_instructor_workload
    where instructor_id = v_inst and source = 'class';
  select sum(annual_hours) into v_rt_total
    from public.v_instructor_workload
    where instructor_id = v_inst and source = 'recurring_task';

  if v_class_total <> 100 then
    raise exception 'Scenario 1 FAIL: class total expected 100, got %', v_class_total;
  end if;
  if v_rt_total <> 104 then
    raise exception 'Scenario 1 FAIL: recurring total expected 104, got %', v_rt_total;
  end if;

  raise notice 'Scenario 1 PASS: 204h assigned, 10.85%% utilization, class=100h, recurring=104h';

  delete from public.recurring_task_assignments where recurring_task_id = v_rt;
  delete from public.recurring_tasks where id = v_rt;
  delete from public.class_instructor_assignments where class_id = v_class;
  delete from public.classes where id = v_class;
  delete from public.instructors where id = v_inst;
end $$;

-- ── Scenario 2 ────────────────────────────────────────────────────────────────
-- Multi-day class with custom_day_hours = [8, 6, 4]. Per-offering instruction
-- = 18h. Plus prep 2 + logistics 1 = 21h. 5 offerings → 105 annual hrs.

do $$
declare
  v_org uuid; v_inst uuid; v_class uuid;
  v_total numeric;
begin
  select id into v_org from public.organizations limit 1;

  insert into public.instructors (org_id, full_name) values (v_org, 'Test Multi-day Inst')
    returning id into v_inst;

  insert into public.classes (
    org_id, name, is_multi_day, total_days, custom_day_hours,
    prep_hours_per_offering, logistics_hours_per_offering, offerings_per_year
  ) values (
    v_org, 'Test Multi-Day '||gen_random_uuid(),
    true, 3, ARRAY[8, 6, 4]::numeric(5,2)[],
    2, 1, 5
  ) returning id into v_class;

  insert into public.class_instructor_assignments (
    org_id, class_id, instructor_id, role, assigned_offerings
  ) values (v_org, v_class, v_inst, 'primary', 5);

  select annual_hours into v_total
    from public.v_instructor_workload
    where instructor_id = v_inst and source = 'class' and source_id = v_class;

  if v_total <> 105 then
    raise exception 'Scenario 2 FAIL: expected 105h (5 offerings × (8+6+4 + 2 + 1)), got %', v_total;
  end if;
  raise notice 'Scenario 2 PASS: multi-day with custom_day_hours=[8,6,4], 5 offerings = 105h';

  delete from public.class_instructor_assignments where class_id = v_class;
  delete from public.classes where id = v_class;
  delete from public.instructors where id = v_inst;
end $$;

-- ── Scenario 3 ────────────────────────────────────────────────────────────────
-- Recurring task at 4 hrs/occurrence with override occurrences_per_year=20
-- = 80 annual hours. Default would be 4 × 12 = 48 (monthly), so the override
-- must be respected.

do $$
declare
  v_org uuid; v_inst uuid; v_rt uuid;
  v_total numeric;
begin
  select id into v_org from public.organizations limit 1;

  insert into public.instructors (org_id, full_name) values (v_org, 'Test Override Inst')
    returning id into v_inst;

  insert into public.recurring_tasks (
    org_id, name, hours_per_occurrence, frequency, occurrences_per_year
  ) values (
    v_org, 'Test Override RT '||gen_random_uuid(),
    4, 'monthly', 20
  ) returning id into v_rt;

  insert into public.recurring_task_assignments (
    org_id, recurring_task_id, instructor_id, share_percent
  ) values (v_org, v_rt, v_inst, 100);

  select annual_hours into v_total
    from public.v_instructor_workload
    where instructor_id = v_inst and source = 'recurring_task' and source_id = v_rt;

  if v_total <> 80 then
    raise exception 'Scenario 3 FAIL: expected 80h (4 × 20 override), got %', v_total;
  end if;
  raise notice 'Scenario 3 PASS: monthly at 4 hrs with occurrences_per_year=20 override = 80h';

  delete from public.recurring_task_assignments where recurring_task_id = v_rt;
  delete from public.recurring_tasks where id = v_rt;
  delete from public.instructors where id = v_inst;
end $$;

-- ── Scenario 4 ────────────────────────────────────────────────────────────────
-- Ad-hoc task in `done` status MUST NOT contribute to workload.

do $$
declare
  v_org uuid; v_inst uuid; v_open_task uuid; v_done_task uuid;
  v_count integer;
  v_total numeric;
begin
  select id into v_org from public.organizations limit 1;

  insert into public.instructors (org_id, full_name) values (v_org, 'Test Ad-Hoc Inst')
    returning id into v_inst;

  insert into public.ad_hoc_tasks (org_id, name, hours, status, instructor_id)
    values (v_org, 'Test Open '||gen_random_uuid(), 4, 'open', v_inst)
    returning id into v_open_task;

  insert into public.ad_hoc_tasks (org_id, name, hours, status, instructor_id)
    values (v_org, 'Test Done '||gen_random_uuid(), 100, 'done', v_inst)
    returning id into v_done_task;

  select count(*), coalesce(sum(annual_hours), 0)
    into v_count, v_total
    from public.v_instructor_workload
    where instructor_id = v_inst and source = 'ad_hoc_task';

  if v_count <> 1 then
    raise exception 'Scenario 4 FAIL: expected 1 ad-hoc workload row, got %', v_count;
  end if;
  if v_total <> 4 then
    raise exception 'Scenario 4 FAIL: expected only the open 4h task, got total %', v_total;
  end if;
  raise notice 'Scenario 4 PASS: ad-hoc done excluded; only the open 4h task contributes';

  delete from public.ad_hoc_tasks where id in (v_open_task, v_done_task);
  delete from public.instructors where id = v_inst;
end $$;

-- ── Scenario 5 ────────────────────────────────────────────────────────────────
-- Soft-deleted class MUST NOT contribute to workload.

do $$
declare
  v_org uuid; v_inst uuid; v_class uuid;
  v_count integer;
begin
  select id into v_org from public.organizations limit 1;

  insert into public.instructors (org_id, full_name) values (v_org, 'Test Soft-Delete Inst')
    returning id into v_inst;

  insert into public.classes (
    org_id, name, hours_per_day, total_days,
    prep_hours_per_offering, logistics_hours_per_offering, offerings_per_year,
    deleted_at
  ) values (
    v_org, 'Test Soft-Deleted '||gen_random_uuid(),
    8, 1, 0, 0, 10,
    now()
  ) returning id into v_class;

  insert into public.class_instructor_assignments (
    org_id, class_id, instructor_id, role, assigned_offerings
  ) values (v_org, v_class, v_inst, 'primary', 10);

  select count(*) into v_count
    from public.v_instructor_workload
    where instructor_id = v_inst and source = 'class';

  if v_count <> 0 then
    raise exception 'Scenario 5 FAIL: soft-deleted class still appears, got % rows', v_count;
  end if;
  raise notice 'Scenario 5 PASS: soft-deleted class excluded from workload';

  delete from public.class_instructor_assignments where class_id = v_class;
  delete from public.classes where id = v_class;
  delete from public.instructors where id = v_inst;
end $$;

-- ── Scenario 6 ────────────────────────────────────────────────────────────────
-- Forecast RPC returns expected weekly hours for a known instructor:
-- 100h class + 104h recurring → 204/52 = 3.9230... hrs/week. With weekly
-- capacity = 1880/52 ≈ 36.15h, utilization ≈ 10.85%.

do $$
declare
  v_org uuid; v_inst uuid; v_class uuid; v_rt uuid;
  v_eff record;
  v_first_week record;
begin
  select id into v_org from public.organizations limit 1;

  insert into public.instructors (org_id, full_name, annual_hours)
    values (v_org, 'Test Forecast Inst', 1880)
    returning id into v_inst;

  insert into public.classes (
    org_id, name, hours_per_day, total_days,
    prep_hours_per_offering, logistics_hours_per_offering, offerings_per_year
  ) values (v_org, 'Forecast Class '||gen_random_uuid(), 8, 1, 1, 1, 10)
    returning id into v_class;

  insert into public.class_instructor_assignments (
    org_id, class_id, instructor_id, role, assigned_offerings
  ) values (v_org, v_class, v_inst, 'primary', 10);

  insert into public.recurring_tasks (org_id, name, hours_per_occurrence, frequency)
    values (v_org, 'Forecast RT '||gen_random_uuid(), 2, 'weekly')
    returning id into v_rt;

  insert into public.recurring_task_assignments (
    org_id, recurring_task_id, instructor_id, share_percent
  ) values (v_org, v_rt, v_inst, 100);

  select * into v_first_week
    from public.instructor_capacity_forecast(v_inst, '2026-01-05'::date, 8)
    order by week_start asc
    limit 1;

  if round(v_first_week.projected_hours::numeric, 4) <> round((204.0 / 52)::numeric, 4) then
    raise exception 'Scenario 6 FAIL: expected projected_hours=%, got %',
      round((204.0 / 52)::numeric, 4), round(v_first_week.projected_hours::numeric, 4);
  end if;
  if round(v_first_week.weekly_capacity::numeric, 4) <> round((1880.0 / 52)::numeric, 4) then
    raise exception 'Scenario 6 FAIL: expected weekly_capacity=%, got %',
      round((1880.0 / 52)::numeric, 4), round(v_first_week.weekly_capacity::numeric, 4);
  end if;
  if round(v_first_week.utilization_pct::numeric, 2) <> 10.85 then
    raise exception 'Scenario 6 FAIL: expected utilization_pct≈10.85, got %',
      round(v_first_week.utilization_pct::numeric, 2);
  end if;

  raise notice 'Scenario 6 PASS: forecast first week = 3.923h projected, 36.15h capacity, 10.85%% utilization';

  delete from public.recurring_task_assignments where recurring_task_id = v_rt;
  delete from public.recurring_tasks where id = v_rt;
  delete from public.class_instructor_assignments where class_id = v_class;
  delete from public.classes where id = v_class;
  delete from public.instructors where id = v_inst;
end $$;
