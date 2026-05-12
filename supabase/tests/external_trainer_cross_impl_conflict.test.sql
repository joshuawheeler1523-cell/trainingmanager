-- =============================================================================
-- pgTAP — Cross-impl trainer conflict on EXTERNAL pool entries
-- =============================================================================
-- Companion to cross_impl_trainer_conflict.test.sql. That suite confirms the
-- mechanism works for INTERNAL instructors. This one confirms the same
-- mechanism fires for instructors flagged is_external = true — i.e. the
-- "external / consultant pool" added in migration 20260512000001.
--
-- The trigger added in 20260511000006 joins impl_trainers → instructors via
-- instructor_id and does NOT filter by is_external. So as long as a pool
-- entry has a non-null instructors row and both impls' impl_trainer rows
-- carry the matching instructor_id, the conflict should land.
-- =============================================================================

begin;
select plan(2);

create extension if not exists pgtap with schema extensions;

do $$
declare
  v_org_id  uuid := 'dddddddd-3333-3333-3333-000000000001';
  v_dept_id uuid;
  v_mgr     uuid := 'dddddddd-3333-3333-3333-000000000002';
  v_inst    uuid := 'dddddddd-3333-3333-3333-000000000003'; -- the external pool entry
  v_impl_a  uuid := 'dddddddd-3333-3333-3333-0000000000a1';
  v_impl_b  uuid := 'dddddddd-3333-3333-3333-0000000000b1';
begin
  insert into public.organizations (id, name, slug)
    values (v_org_id, 'External Pool Test Org', 'ext-pool-' || gen_random_uuid()::text)
    on conflict (id) do nothing;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
    values (v_mgr, '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', 'ext-mgr@arbor.local', '', now(), now(), now())
    on conflict (id) do nothing;

  insert into public.org_memberships (org_id, user_id, role, accepted_at)
    values (v_org_id, v_mgr, 'manager', now())
    on conflict (org_id, user_id) do update set role = excluded.role, accepted_at = now();

  select id into v_dept_id
    from public.departments where org_id = v_org_id limit 1;
  if v_dept_id is null then
    insert into public.departments (org_id, name, slug)
      values (v_org_id, 'General', 'general') returning id into v_dept_id;
  end if;
  insert into public.department_memberships (department_id, user_id, role, accepted_at)
    values (v_dept_id, v_mgr, 'department_admin', now())
    on conflict (department_id, user_id) do nothing;

  -- The external pool entry — same instructors table, just flagged.
  insert into public.instructors (id, org_id, department_id, full_name, email,
                                  status, is_external, annual_hours)
    values (v_inst, v_org_id, v_dept_id, 'Casey Consultant', 'casey@example.com',
            'active', true, 0)
    on conflict (id) do nothing;

  insert into public.implementations (id, org_id, department_id, name,
                                      window_start_date, window_end_date, status)
    values
      (v_impl_a, v_org_id, v_dept_id, 'Hospital A — Wave 1',
       '2026-07-01', '2026-07-31', 'draft'),
      (v_impl_b, v_org_id, v_dept_id, 'Hospital B — Wave 1',
       '2026-07-01', '2026-07-31', 'draft')
    on conflict (id) do nothing;

  -- A class in each implementation.
  insert into public.impl_classes (id, org_id, department_id, implementation_id, name,
                                   total_people_to_train, expected_learners_per_session,
                                   hours_per_session)
    values
      ('dddddddd-3333-3333-3333-0000000000c1', v_org_id, v_dept_id, v_impl_a,
       'EMR Provider Module', 20, 10, 4),
      ('dddddddd-3333-3333-3333-0000000000c2', v_org_id, v_dept_id, v_impl_b,
       'Operative Reports Module', 20, 10, 4)
    on conflict (id) do nothing;

  -- One impl_trainer in each impl, both linked to the same external pool entry.
  -- This is the "Casey Consultant works at both hospitals" scenario.
  insert into public.impl_trainers (id, org_id, department_id, implementation_id,
                                    instructor_id, name, email,
                                    availability_hours_per_week)
    values
      ('dddddddd-3333-3333-3333-0000000000t1', v_org_id, v_dept_id, v_impl_a,
       v_inst, 'Casey Consultant', 'casey@example.com', 40),
      ('dddddddd-3333-3333-3333-0000000000t2', v_org_id, v_dept_id, v_impl_b,
       v_inst, 'Casey Consultant', 'casey@example.com', 40)
    on conflict (id) do nothing;

  -- Two overlapping sessions: 10am-2pm on July 15 in BOTH impls, both
  -- assigned to Casey via their respective impl_trainer rows.
  insert into public.impl_sessions (id, org_id, department_id, implementation_id,
                                    impl_class_id, impl_trainer_id,
                                    scheduled_start, scheduled_end,
                                    learners_count, status)
    values
      ('dddddddd-3333-3333-3333-0000000000s1', v_org_id, v_dept_id, v_impl_a,
       'dddddddd-3333-3333-3333-0000000000c1',
       'dddddddd-3333-3333-3333-0000000000t1',
       '2026-07-15 10:00:00+00', '2026-07-15 14:00:00+00', 10, 'draft'),
      ('dddddddd-3333-3333-3333-0000000000s2', v_org_id, v_dept_id, v_impl_b,
       'dddddddd-3333-3333-3333-0000000000c2',
       'dddddddd-3333-3333-3333-0000000000t2',
       '2026-07-15 10:00:00+00', '2026-07-15 14:00:00+00', 10, 'draft')
    on conflict (id) do nothing;
end$$;

-- ── Assertions ───────────────────────────────────────────────────────────

-- Session A: should be flagged 'full' (Casey is double-booked in B).
select is(
  (select conflict_status::text from public.impl_sessions
     where id = 'dddddddd-3333-3333-3333-0000000000s1'),
  'full',
  'External pool: session A flagged full when its trainer overlaps with one in impl B'
);

-- Session B: should also be flagged 'full' via the AFTER sibling-recompute
-- trigger. Bilateral flagging is the whole point of the cross-impl design.
select is(
  (select conflict_status::text from public.impl_sessions
     where id = 'dddddddd-3333-3333-3333-0000000000s2'),
  'full',
  'External pool: session B picked up the conflict bilaterally via the AFTER trigger'
);

select * from finish();
rollback;
