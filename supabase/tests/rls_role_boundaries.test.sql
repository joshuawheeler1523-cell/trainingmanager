-- =============================================================================
-- pgTAP — RLS role boundaries
-- =============================================================================
-- Verifies the Phase 3+4 RLS policies:
--   • Viewer can SELECT but cannot INSERT/UPDATE/DELETE on a tenant table.
--   • Instructor can SELECT + UPDATE own instructors row, but not others'.
--   • Instructor cannot INSERT into a manager-only table (e.g. classes).
--   • Manager has full access on the same surfaces.
--
-- Representative coverage. Full (role × op × table) matrix is documented
-- in SECURITY.md and enforced by RLS; tests below sample the canonical
-- patterns without exhausting every table.
--
-- Run locally:
--   supabase start
--   supabase test db
-- =============================================================================

begin;
select plan(15);

create extension if not exists pgtap with schema extensions;

-- ── Fixture (idempotent): same as role_helpers.test.sql ──────────────────

do $$
declare
  v_org_id  uuid := 'cccccccc-2222-2222-2222-000000000001';
  v_mgr     uuid := 'cccccccc-2222-2222-2222-000000000002';
  v_inst    uuid := 'cccccccc-2222-2222-2222-000000000003';
  v_view    uuid := 'cccccccc-2222-2222-2222-000000000004';
  v_dept_id uuid;
begin
  insert into public.organizations (id, name, slug)
    values (v_org_id, 'RLS Test Org', 'rls-test-' || gen_random_uuid()::text)
    on conflict (id) do nothing;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
    values (v_mgr, '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', 'rls-mgr@arbor.local', '', now(), now(), now()),
           (v_inst, '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', 'rls-inst@arbor.local', '', now(), now(), now()),
           (v_view, '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', 'rls-view@arbor.local', '', now(), now(), now())
    on conflict (id) do nothing;

  insert into public.org_memberships (org_id, user_id, role, accepted_at)
    values (v_org_id, v_mgr, 'manager', now()),
           (v_org_id, v_inst, 'instructor', now()),
           (v_org_id, v_view, 'viewer', now())
    on conflict (org_id, user_id) do update set role = excluded.role, accepted_at = now();

  -- Default department + dept_memberships (RLS depends on user_department_ids())
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

  -- Link instructor user to an instructors row
  insert into public.instructors (org_id, department_id, user_id, full_name, email,
                                  annual_hours, status)
    values (v_org_id, v_dept_id, v_inst, 'RLS Test Instructor', 'rls-inst@arbor.local',
            1880, 'active')
    on conflict do nothing;

  -- Add a second instructor (unlinked) so we can test cross-row isolation.
  insert into public.instructors (org_id, department_id, full_name, email,
                                  annual_hours, status)
    values (v_org_id, v_dept_id, 'Other Instructor', 'rls-other@arbor.local',
            1880, 'active')
    on conflict do nothing;
end $$;

create or replace function tests.set_auth_user(p_user_id uuid)
  returns void language sql as $$
    select set_config('request.jwt.claim.sub', p_user_id::text, true);
$$;

set local role authenticated;

-- ── Manager: full access ─────────────────────────────────────────────────

select tests.set_auth_user('cccccccc-2222-2222-2222-000000000002'::uuid);

select lives_ok(
  $cmd$
    insert into public.classes (org_id, department_id, name, status)
    select 'cccccccc-2222-2222-2222-000000000001',
           (select id from public.departments where org_id = 'cccccccc-2222-2222-2222-000000000001' limit 1),
           'Manager Test Class', 'active'
  $cmd$,
  'manager: can INSERT into classes'
);

select isnt_empty(
  $cmd$ select id from public.instructors
        where org_id = 'cccccccc-2222-2222-2222-000000000001' $cmd$,
  'manager: SELECT instructors returns rows'
);

-- ── Instructor: SELECT works, INSERT into manager-only table fails ──────

select tests.set_auth_user('cccccccc-2222-2222-2222-000000000003'::uuid);

select isnt_empty(
  $cmd$ select id from public.instructors
        where org_id = 'cccccccc-2222-2222-2222-000000000001' $cmd$,
  'instructor: SELECT instructors returns rows'
);

select throws_ok(
  $cmd$
    insert into public.classes (org_id, department_id, name, status)
    select 'cccccccc-2222-2222-2222-000000000001',
           (select id from public.departments where org_id = 'cccccccc-2222-2222-2222-000000000001' limit 1),
           'Instructor Cant Insert', 'active'
  $cmd$,
  'new row violates row-level security policy for table "classes"',
  'instructor: INSERT into classes blocked by RLS'
);

select throws_ok(
  $cmd$
    insert into public.skills (org_id, department_id, name)
    select 'cccccccc-2222-2222-2222-000000000001',
           (select id from public.departments where org_id = 'cccccccc-2222-2222-2222-000000000001' limit 1),
           'Instructor Cant Skill'
  $cmd$,
  'new row violates row-level security policy for table "skills"',
  'instructor: INSERT into skills blocked by RLS'
);

-- Instructor can update own row's phone, but not someone else's row
select lives_ok(
  $cmd$
    update public.instructors set phone = '555-0100'
    where user_id = 'cccccccc-2222-2222-2222-000000000003'
  $cmd$,
  'instructor: UPDATE own instructor row succeeds'
);

select results_eq(
  $cmd$
    update public.instructors set phone = '555-0101'
    where org_id = 'cccccccc-2222-2222-2222-000000000001'
      and user_id is null
    returning id
  $cmd$,
  $cmd$ select null::uuid where false $cmd$,
  'instructor: UPDATE other instructor row affects zero rows (RLS hides it from UPDATE)'
);

-- Column ACL trigger: instructor cannot change their own status
select throws_ok(
  $cmd$
    update public.instructors set status = 'inactive'
    where user_id = 'cccccccc-2222-2222-2222-000000000003'
  $cmd$,
  'instructor cannot change status',
  'instructor: column ACL blocks changing status on own row'
);

-- ── Viewer: SELECT works, every mutation blocked ────────────────────────

select tests.set_auth_user('cccccccc-2222-2222-2222-000000000004'::uuid);

select isnt_empty(
  $cmd$ select id from public.instructors
        where org_id = 'cccccccc-2222-2222-2222-000000000001' $cmd$,
  'viewer: SELECT instructors returns rows'
);

select isnt_empty(
  $cmd$ select id from public.classes
        where org_id = 'cccccccc-2222-2222-2222-000000000001' $cmd$,
  'viewer: SELECT classes returns rows'
);

select throws_ok(
  $cmd$
    insert into public.classes (org_id, department_id, name, status)
    select 'cccccccc-2222-2222-2222-000000000001',
           (select id from public.departments where org_id = 'cccccccc-2222-2222-2222-000000000001' limit 1),
           'Viewer Cant Insert', 'active'
  $cmd$,
  'new row violates row-level security policy for table "classes"',
  'viewer: INSERT into classes blocked'
);

select throws_ok(
  $cmd$
    insert into public.instructors (org_id, department_id, full_name, annual_hours, status)
    select 'cccccccc-2222-2222-2222-000000000001',
           (select id from public.departments where org_id = 'cccccccc-2222-2222-2222-000000000001' limit 1),
           'Viewer Cant', 1880, 'active'
  $cmd$,
  'new row violates row-level security policy for table "instructors"',
  'viewer: INSERT into instructors blocked'
);

select results_eq(
  $cmd$
    update public.instructors set phone = '555-9999'
    where org_id = 'cccccccc-2222-2222-2222-000000000001'
    returning id
  $cmd$,
  $cmd$ select null::uuid where false $cmd$,
  'viewer: UPDATE instructors affects zero rows (no policy permits it)'
);

select results_eq(
  $cmd$
    delete from public.classes
    where org_id = 'cccccccc-2222-2222-2222-000000000001'
    returning id
  $cmd$,
  $cmd$ select null::uuid where false $cmd$,
  'viewer: DELETE classes affects zero rows'
);

-- TRA-specific: viewer cannot create a TRA, instructor can
select tests.set_auth_user('cccccccc-2222-2222-2222-000000000003'::uuid);

select lives_ok(
  $cmd$
    insert into public.tras (org_id, department_id, project_name, status)
    select 'cccccccc-2222-2222-2222-000000000001',
           (select id from public.departments where org_id = 'cccccccc-2222-2222-2222-000000000001' limit 1),
           'Instructor Test TRA', 'draft'
  $cmd$,
  'instructor: can INSERT a TRA in own dept (will become creator)'
);

select * from finish();
rollback;
