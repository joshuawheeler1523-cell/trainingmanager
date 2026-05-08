-- Phase 7.2 — Schedule generator + conflict trigger.
--
-- Run with:
--   supabase db execute --file packages/db/supabase/tests/schedule_generator_scenarios.sql

-- ── Scenario 1 ───────────────────────────────────────────────────────────────
-- 100 people, 1 class, 20 per session ⇒ 5 sessions, all green.

do $$
declare
  v_org   uuid;
  v_impl  uuid;
  v_class uuid;
  v_room  uuid;
  v_inst  uuid;
  v_t     uuid;
  v_count int;
  v_conflicts int;
begin
  select id into v_org from public.organizations limit 1;

  insert into public.implementations (org_id, name, window_start_date, window_end_date, go_live_date)
    values (v_org, 'Sched Test 1 '||gen_random_uuid(),
            current_date + 1, current_date + 30, current_date + 35)
    returning id into v_impl;

  insert into public.impl_rooms (org_id, implementation_id, name, seat_capacity, available_hours_per_day)
    values (v_org, v_impl, 'Room A', 20, 8)
    returning id into v_room;

  insert into public.instructors (org_id, full_name) values (v_org, 'Test Inst')
    returning id into v_inst;
  insert into public.impl_trainers (org_id, implementation_id, instructor_id, name, availability_hours_per_week)
    values (v_org, v_impl, v_inst, 'Test Inst', 40)
    returning id into v_t;

  insert into public.impl_classes (
    org_id, implementation_id, name, hours_per_session,
    expected_learners_per_session, total_people_to_train
  ) values (v_org, v_impl, 'EMR Basics', 2, 20, 100)
    returning id into v_class;

  insert into public.impl_class_trainers (org_id, impl_class_id, impl_trainer_id)
    values (v_org, v_class, v_t);

  perform public.generate_implementation_schedule(v_impl);

  select count(*), count(*) filter (where conflict_status <> 'none')
    into v_count, v_conflicts
    from public.impl_sessions where implementation_id = v_impl;

  if v_count <> 5 then
    raise exception 'Scenario 1 FAIL: expected 5 sessions, got %', v_count;
  end if;
  if v_conflicts <> 0 then
    raise exception 'Scenario 1 FAIL: expected 0 conflicts, got %', v_conflicts;
  end if;

  raise notice 'Scenario 1 PASS: 100 people / 20 per = 5 green sessions';

  delete from public.impl_class_trainers where impl_class_id = v_class;
  delete from public.impl_classes where id = v_class;
  delete from public.impl_trainers where id = v_t;
  delete from public.impl_rooms where id = v_room;
  delete from public.implementations where id = v_impl;
  delete from public.instructors where id = v_inst;
end $$;

-- ── Scenario 2 ───────────────────────────────────────────────────────────────
-- Two classes A and B, B prereq on A. Generator should schedule every B
-- session at or after A's first session.

do $$
declare
  v_org    uuid;
  v_impl   uuid;
  v_a      uuid;
  v_b      uuid;
  v_room   uuid;
  v_t      uuid;
  v_a_first timestamptz;
  v_b_first timestamptz;
begin
  select id into v_org from public.organizations limit 1;
  insert into public.implementations (org_id, name, window_start_date, window_end_date, go_live_date)
    values (v_org, 'Sched Test 2 '||gen_random_uuid(),
            current_date + 1, current_date + 60, current_date + 65)
    returning id into v_impl;
  insert into public.impl_rooms (org_id, implementation_id, name, seat_capacity, available_hours_per_day)
    values (v_org, v_impl, 'Room A', 20, 8)
    returning id into v_room;
  insert into public.impl_trainers (org_id, implementation_id, name, availability_hours_per_week)
    values (v_org, v_impl, 'Trainer 1', 40)
    returning id into v_t;

  insert into public.impl_classes (
    org_id, implementation_id, name, hours_per_session,
    expected_learners_per_session, total_people_to_train
  ) values (v_org, v_impl, 'A', 2, 10, 20) returning id into v_a;
  insert into public.impl_classes (
    org_id, implementation_id, name, hours_per_session,
    expected_learners_per_session, total_people_to_train
  ) values (v_org, v_impl, 'B', 2, 10, 20) returning id into v_b;

  insert into public.impl_class_trainers (org_id, impl_class_id, impl_trainer_id)
    values (v_org, v_a, v_t), (v_org, v_b, v_t);

  insert into public.impl_class_prerequisites (org_id, impl_class_id, prerequisite_id)
    values (v_org, v_b, v_a);

  perform public.generate_implementation_schedule(v_impl);

  select min(scheduled_start) into v_a_first
    from public.impl_sessions where implementation_id = v_impl and impl_class_id = v_a;
  select min(scheduled_start) into v_b_first
    from public.impl_sessions where implementation_id = v_impl and impl_class_id = v_b;

  if v_b_first < v_a_first then
    raise exception 'Scenario 2 FAIL: B''s first session (%) is before A''s first (%)',
      v_b_first, v_a_first;
  end if;

  raise notice 'Scenario 2 PASS: prereq enforced — B starts at or after A';

  delete from public.impl_class_prerequisites where impl_class_id = v_b;
  delete from public.impl_class_trainers where impl_class_id in (v_a, v_b);
  delete from public.impl_sessions where implementation_id = v_impl;
  delete from public.impl_classes where id in (v_a, v_b);
  delete from public.impl_trainers where id = v_t;
  delete from public.impl_rooms where id = v_room;
  delete from public.implementations where id = v_impl;
end $$;

-- ── Scenario 3 ───────────────────────────────────────────────────────────────
-- Capacity shortage: only one tiny room, large audience ⇒ generator should
-- still emit sessions, some flagged with conflict_status because the trainer
-- can't fit them all in their weekly availability cap.

do $$
declare
  v_org    uuid;
  v_impl   uuid;
  v_class  uuid;
  v_room   uuid;
  v_t      uuid;
  v_count  int;
  v_full   int;
begin
  select id into v_org from public.organizations limit 1;
  insert into public.implementations (org_id, name, window_start_date, window_end_date, go_live_date)
    values (v_org, 'Sched Test 3 '||gen_random_uuid(),
            current_date + 1, current_date + 7, current_date + 10)
    returning id into v_impl;
  insert into public.impl_rooms (org_id, implementation_id, name, seat_capacity, available_hours_per_day)
    values (v_org, v_impl, 'Tiny Room', 20, 4)
    returning id into v_room;
  -- Cap trainer at 4 hours/week — way too few for the workload.
  insert into public.impl_trainers (org_id, implementation_id, name, availability_hours_per_week)
    values (v_org, v_impl, 'Cap Trainer', 4)
    returning id into v_t;

  insert into public.impl_classes (
    org_id, implementation_id, name, hours_per_session,
    expected_learners_per_session, total_people_to_train
  ) values (v_org, v_impl, 'Big Class', 2, 20, 200)
    returning id into v_class;
  insert into public.impl_class_trainers (org_id, impl_class_id, impl_trainer_id)
    values (v_org, v_class, v_t);

  perform public.generate_implementation_schedule(v_impl);

  select count(*) into v_count
    from public.impl_sessions where implementation_id = v_impl;
  select count(*) into v_full
    from public.impl_sessions
    where implementation_id = v_impl and conflict_status = 'full';

  if v_count <> 10 then
    raise exception 'Scenario 3 FAIL: expected 10 sessions, got %', v_count;
  end if;
  -- We don't know exactly how many will be flagged, but at least some should be.
  if v_full = 0 then
    raise exception 'Scenario 3 FAIL: expected at least one full conflict, got 0';
  end if;

  raise notice 'Scenario 3 PASS: capacity shortage produced % sessions, % full conflicts',
    v_count, v_full;

  delete from public.impl_class_trainers where impl_class_id = v_class;
  delete from public.impl_sessions where implementation_id = v_impl;
  delete from public.impl_classes where id = v_class;
  delete from public.impl_trainers where id = v_t;
  delete from public.impl_rooms where id = v_room;
  delete from public.implementations where id = v_impl;
end $$;
