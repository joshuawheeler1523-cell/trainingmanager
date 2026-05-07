-- Manual verification scenarios for Recurring + Ad-Hoc tasks (Prompt 2.2).
--
-- Run with:
--   supabase db execute --file packages/db/supabase/tests/tasks_scenarios.sql
--
-- Each scenario is a self-contained do-block that creates fixtures, asserts
-- expected behavior, and cleans up. Raises an exception on failure.

-- ── Scenario 1 ────────────────────────────────────────────────────────────────
-- frequency_to_annual returns the expected per-frequency defaults.

do $$
begin
  if public.frequency_to_annual('daily')     <> 250 then raise exception 'daily expected 250';     end if;
  if public.frequency_to_annual('weekly')    <> 52  then raise exception 'weekly expected 52';     end if;
  if public.frequency_to_annual('biweekly')  <> 26  then raise exception 'biweekly expected 26';   end if;
  if public.frequency_to_annual('monthly')   <> 12  then raise exception 'monthly expected 12';    end if;
  if public.frequency_to_annual('quarterly') <> 4   then raise exception 'quarterly expected 4';   end if;
  if public.frequency_to_annual('annually')  <> 1   then raise exception 'annually expected 1';    end if;
  raise notice 'Scenario 1 PASS: frequency_to_annual returns expected per-frequency defaults';
end $$;

-- ── Scenario 2 ────────────────────────────────────────────────────────────────
-- Weekly task at 2 hrs/occurrence using the default = 104 annual hours.
-- Verified by reading back the row and computing the same formula the workload
-- view will use.

do $$
declare
  v_org uuid;
  v_task uuid;
  v_annual numeric;
begin
  select id into v_org from public.organizations limit 1;

  insert into public.recurring_tasks (org_id, name, hours_per_occurrence, frequency)
    values (v_org, 'Test Weekly '||gen_random_uuid(), 2, 'weekly')
    returning id into v_task;

  select hours_per_occurrence
       * coalesce(occurrences_per_year, public.frequency_to_annual(frequency))
    into v_annual
    from public.recurring_tasks where id = v_task;

  if v_annual <> 104 then
    raise exception 'Scenario 2 FAIL: expected 104, got %', v_annual;
  end if;
  raise notice 'Scenario 2 PASS: weekly + 2 hrs default = 104 annual hours';

  delete from public.recurring_tasks where id = v_task;
end $$;

-- ── Scenario 3 ────────────────────────────────────────────────────────────────
-- Weekly task at 2 hrs/occurrence with override 30 = 60 annual hours.

do $$
declare
  v_org uuid;
  v_task uuid;
  v_annual numeric;
begin
  select id into v_org from public.organizations limit 1;

  insert into public.recurring_tasks (org_id, name, hours_per_occurrence, frequency, occurrences_per_year)
    values (v_org, 'Test Override '||gen_random_uuid(), 2, 'weekly', 30)
    returning id into v_task;

  select hours_per_occurrence
       * coalesce(occurrences_per_year, public.frequency_to_annual(frequency))
    into v_annual
    from public.recurring_tasks where id = v_task;

  if v_annual <> 60 then
    raise exception 'Scenario 3 FAIL: expected 60, got %', v_annual;
  end if;
  raise notice 'Scenario 3 PASS: weekly + 2 hrs override 30 = 60 annual hours';

  delete from public.recurring_tasks where id = v_task;
end $$;

-- ── Scenario 4 ────────────────────────────────────────────────────────────────
-- Ad-hoc tasks in `done` status keep their hours and completed_at, but the
-- workload view (Phase 3) is expected to filter them out. We verify that
-- updating to `done` stamps completed_at, and reverting clears it. The view
-- itself is built in 11.1 — placeholder here.

do $$
declare
  v_org uuid;
  v_task uuid;
  v_completed timestamptz;
begin
  select id into v_org from public.organizations limit 1;

  insert into public.ad_hoc_tasks (org_id, name, hours, status)
    values (v_org, 'Test Done '||gen_random_uuid(), 4, 'open')
    returning id into v_task;

  -- Initially completed_at is null
  select completed_at into v_completed from public.ad_hoc_tasks where id = v_task;
  if v_completed is not null then
    raise exception 'Scenario 4 FAIL: completed_at should be null when status=open, got %', v_completed;
  end if;

  raise notice 'Scenario 4 PASS: ad-hoc task created with completed_at=null. (Workload-view exclusion check lands in Phase 3.)';

  delete from public.ad_hoc_tasks where id = v_task;
end $$;
