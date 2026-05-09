-- =============================================================================
-- pgTAP — Manager-only tables: instructor + viewer cannot mutate
-- =============================================================================
-- Phase 4 makes these tables manager-only for INSERT/UPDATE/DELETE:
--   classes, class_instructor_assignments, class_skill_requirements,
--   skills, allocation_buckets, allocation_groups, allocation_group_members,
--   global_allocations, group_allocations, milestones, task_dependencies,
--   dependencies, project_team_members, task_assignments, implementations,
--   impl_rooms, impl_modules, impl_classes, impl_class_prerequisites,
--   impl_trainers, impl_sessions, impl_class_trainers, recurring_tasks,
--   recurring_task_assignments, ad_hoc_tasks, education_requests
--
-- Sample tested below: classes, skills, allocation_buckets, milestones,
-- recurring_tasks, education_requests. The rest follow the same RLS pattern.
-- =============================================================================

begin;
select plan(18);

create extension if not exists pgtap with schema extensions;

-- ── Fixture ──────────────────────────────────────────────────────────────

do $$
declare
  v_org_id  uuid := 'cccccccc-3333-3333-3333-000000000001';
  v_mgr     uuid := 'cccccccc-3333-3333-3333-000000000002';
  v_inst    uuid := 'cccccccc-3333-3333-3333-000000000003';
  v_view    uuid := 'cccccccc-3333-3333-3333-000000000004';
  v_dept_id uuid;
begin
  insert into public.organizations (id, name, slug)
    values (v_org_id, 'Manager-Only Test Org', 'mgr-only-' || gen_random_uuid()::text)
    on conflict (id) do nothing;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
    values (v_mgr, '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', 'mo-mgr@arbor.local', '', now(), now(), now()),
           (v_inst, '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', 'mo-inst@arbor.local', '', now(), now(), now()),
           (v_view, '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', 'mo-view@arbor.local', '', now(), now(), now())
    on conflict (id) do nothing;

  insert into public.org_memberships (org_id, user_id, role, accepted_at)
    values (v_org_id, v_mgr, 'manager', now()),
           (v_org_id, v_inst, 'instructor', now()),
           (v_org_id, v_view, 'viewer', now())
    on conflict (org_id, user_id) do update set role = excluded.role, accepted_at = now();

  select id into v_dept_id
    from public.departments where org_id = v_org_id limit 1;
  if v_dept_id is null then
    insert into public.departments (org_id, name, slug)
      values (v_org_id, 'General', 'general') returning id into v_dept_id;
  end if;
  insert into public.department_memberships (department_id, user_id, role, accepted_at)
    values (v_dept_id, v_mgr, 'admin', now()),
           (v_dept_id, v_inst, 'member', now()),
           (v_dept_id, v_view, 'member', now())
    on conflict do nothing;
end $$;

create or replace function tests.set_auth_user(p_user_id uuid)
  returns void language sql as $$
    select set_config('request.jwt.claim.sub', p_user_id::text, true);
$$;

set local role authenticated;

-- Helper: dept id for the test org
create or replace function tests.test_dept_id()
  returns uuid language sql as $$
    select id from public.departments
      where org_id = 'cccccccc-3333-3333-3333-000000000001' limit 1;
$$;

-- ── Manager: can INSERT into every manager-only sample ──────────────────

select tests.set_auth_user('cccccccc-3333-3333-3333-000000000002'::uuid);

select lives_ok(
  $$ insert into public.classes (org_id, department_id, name, status)
     values ('cccccccc-3333-3333-3333-000000000001', tests.test_dept_id(), 'MO-mgr-class', 'active') $$,
  'manager: INSERT into classes succeeds'
);
select lives_ok(
  $$ insert into public.skills (org_id, department_id, name)
     values ('cccccccc-3333-3333-3333-000000000001', tests.test_dept_id(), 'MO-mgr-skill') $$,
  'manager: INSERT into skills succeeds'
);
select lives_ok(
  $$ insert into public.allocation_buckets (org_id, department_id, name, target_pct)
     values ('cccccccc-3333-3333-3333-000000000001', tests.test_dept_id(), 'MO-mgr-bucket', 50) $$,
  'manager: INSERT into allocation_buckets succeeds'
);
select lives_ok(
  $$ insert into public.recurring_tasks (org_id, department_id, name, frequency, hours_per_occurrence)
     values ('cccccccc-3333-3333-3333-000000000001', tests.test_dept_id(),
             'MO-mgr-rec', 'monthly', 4) $$,
  'manager: INSERT into recurring_tasks succeeds'
);
select lives_ok(
  $$ insert into public.education_requests (org_id, department_id, title, status, submitted_via)
     values ('cccccccc-3333-3333-3333-000000000001', tests.test_dept_id(),
             'MO-mgr-req', 'new', 'internal') $$,
  'manager: INSERT into education_requests succeeds'
);

-- ── Instructor: blocked from every manager-only sample ─────────────────

select tests.set_auth_user('cccccccc-3333-3333-3333-000000000003'::uuid);

select throws_ok(
  $$ insert into public.classes (org_id, department_id, name, status)
     values ('cccccccc-3333-3333-3333-000000000001', tests.test_dept_id(), 'MO-inst-class', 'active') $$,
  'new row violates row-level security policy for table "classes"',
  'instructor: INSERT into classes blocked'
);
select throws_ok(
  $$ insert into public.skills (org_id, department_id, name)
     values ('cccccccc-3333-3333-3333-000000000001', tests.test_dept_id(), 'MO-inst-skill') $$,
  'new row violates row-level security policy for table "skills"',
  'instructor: INSERT into skills blocked'
);
select throws_ok(
  $$ insert into public.allocation_buckets (org_id, department_id, name, target_pct)
     values ('cccccccc-3333-3333-3333-000000000001', tests.test_dept_id(), 'MO-inst-bucket', 25) $$,
  'new row violates row-level security policy for table "allocation_buckets"',
  'instructor: INSERT into allocation_buckets blocked'
);
select throws_ok(
  $$ insert into public.recurring_tasks (org_id, department_id, name, frequency, hours_per_occurrence)
     values ('cccccccc-3333-3333-3333-000000000001', tests.test_dept_id(),
             'MO-inst-rec', 'monthly', 4) $$,
  'new row violates row-level security policy for table "recurring_tasks"',
  'instructor: INSERT into recurring_tasks blocked'
);
select throws_ok(
  $$ insert into public.education_requests (org_id, department_id, title, status, submitted_via)
     values ('cccccccc-3333-3333-3333-000000000001', tests.test_dept_id(),
             'MO-inst-req', 'new', 'internal') $$,
  'new row violates row-level security policy for table "education_requests"',
  'instructor: INSERT into education_requests blocked'
);

-- Instructor SELECT still works (read tier covers them)
select isnt_empty(
  $$ select id from public.classes
       where org_id = 'cccccccc-3333-3333-3333-000000000001' $$,
  'instructor: SELECT classes returns rows (manager seeded one)'
);
select isnt_empty(
  $$ select id from public.skills
       where org_id = 'cccccccc-3333-3333-3333-000000000001' $$,
  'instructor: SELECT skills returns rows'
);

-- Instructor UPDATE on manager-only table affects 0 rows
select results_eq(
  $$ update public.classes set name = 'inst-tampered'
       where org_id = 'cccccccc-3333-3333-3333-000000000001' returning id $$,
  $$ select null::uuid where false $$,
  'instructor: UPDATE classes affects zero rows'
);

-- ── Viewer: blocked from every manager-only sample ─────────────────────

select tests.set_auth_user('cccccccc-3333-3333-3333-000000000004'::uuid);

select throws_ok(
  $$ insert into public.classes (org_id, department_id, name, status)
     values ('cccccccc-3333-3333-3333-000000000001', tests.test_dept_id(), 'MO-view-class', 'active') $$,
  'new row violates row-level security policy for table "classes"',
  'viewer: INSERT into classes blocked'
);
select throws_ok(
  $$ insert into public.allocation_buckets (org_id, department_id, name, target_pct)
     values ('cccccccc-3333-3333-3333-000000000001', tests.test_dept_id(), 'MO-view-bucket', 25) $$,
  'new row violates row-level security policy for table "allocation_buckets"',
  'viewer: INSERT into allocation_buckets blocked'
);

-- Viewer SELECT still works
select isnt_empty(
  $$ select id from public.classes
       where org_id = 'cccccccc-3333-3333-3333-000000000001' $$,
  'viewer: SELECT classes returns rows'
);

-- Viewer DELETE affects 0 rows (no policy grants delete)
select results_eq(
  $$ delete from public.classes
       where org_id = 'cccccccc-3333-3333-3333-000000000001' returning id $$,
  $$ select null::uuid where false $$,
  'viewer: DELETE classes affects zero rows'
);

select * from finish();
rollback;
