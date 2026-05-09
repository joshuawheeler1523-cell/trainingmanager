-- =============================================================================
-- pgTAP — Role helper functions
-- =============================================================================
-- Verifies the SECURITY DEFINER helpers added in Phase 1 behave correctly:
--   user_role_in_org(uuid)           returns the caller's role or NULL
--   has_any_role(uuid, text[])       returns boolean
--   is_manager / is_instructor / is_viewer (uuid)
--   current_instructor_id(uuid)      resolves auth.uid() → instructors.id
--
-- Run locally:
--   supabase start          # ensure local stack is up
--   supabase test db        # runs every supabase/tests/*.sql file
-- =============================================================================

begin;
select plan(20);

-- ── Fixture: create a test org + 3 auth users (manager/instructor/viewer) ──

create extension if not exists pgtap with schema extensions;

-- Use the postgres superuser context for setup so RLS doesn't bite.
-- These IDs are deterministic so assertions can hardcode them.
do $$
declare
  v_org_id  uuid := 'cccccccc-1111-1111-1111-000000000001';
  v_mgr     uuid := 'cccccccc-1111-1111-1111-000000000002';
  v_inst    uuid := 'cccccccc-1111-1111-1111-000000000003';
  v_view    uuid := 'cccccccc-1111-1111-1111-000000000004';
begin
  -- Org
  insert into public.organizations (id, name, slug)
    values (v_org_id, 'Test Org', 'test-org-' || gen_random_uuid()::text)
    on conflict (id) do nothing;

  -- Auth users (minimal: just an id; supabase auth tables are deeper but pgtap
  -- tests don't need a full user record for FK satisfaction).
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
    values (v_mgr, '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', 'mgr-test@arbor.local', '', now(), now(), now())
    on conflict (id) do nothing;
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
    values (v_inst, '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', 'inst-test@arbor.local', '', now(), now(), now())
    on conflict (id) do nothing;
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
    values (v_view, '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', 'view-test@arbor.local', '', now(), now(), now())
    on conflict (id) do nothing;

  -- Memberships (accepted_at must be non-null for helpers to count them)
  insert into public.org_memberships (org_id, user_id, role, accepted_at)
    values (v_org_id, v_mgr, 'manager', now())
    on conflict (org_id, user_id) do update set role = 'manager', accepted_at = now();
  insert into public.org_memberships (org_id, user_id, role, accepted_at)
    values (v_org_id, v_inst, 'instructor', now())
    on conflict (org_id, user_id) do update set role = 'instructor', accepted_at = now();
  insert into public.org_memberships (org_id, user_id, role, accepted_at)
    values (v_org_id, v_view, 'viewer', now())
    on conflict (org_id, user_id) do update set role = 'viewer', accepted_at = now();
end $$;

-- ── Helper: switch to a given user via JWT claim ─────────────────────────────

create or replace function tests.set_auth_user(p_user_id uuid)
  returns void language sql as $$
    select set_config('request.jwt.claim.sub', p_user_id::text, true);
$$;

-- ── Tests as manager ─────────────────────────────────────────────────────────

set local role authenticated;
select tests.set_auth_user('cccccccc-1111-1111-1111-000000000002'::uuid);

select is(
  public.user_role_in_org('cccccccc-1111-1111-1111-000000000001'::uuid),
  'manager',
  'manager: user_role_in_org returns manager'
);
select ok(
  public.is_manager('cccccccc-1111-1111-1111-000000000001'::uuid),
  'manager: is_manager() = true'
);
select ok(
  not public.is_instructor('cccccccc-1111-1111-1111-000000000001'::uuid),
  'manager: is_instructor() = false'
);
select ok(
  not public.is_viewer('cccccccc-1111-1111-1111-000000000001'::uuid),
  'manager: is_viewer() = false'
);
select ok(
  public.has_any_role('cccccccc-1111-1111-1111-000000000001'::uuid,
                       array['manager','instructor']),
  'manager: has_any_role(manager|instructor) = true'
);
select ok(
  not public.has_any_role('cccccccc-1111-1111-1111-000000000001'::uuid,
                          array['viewer']),
  'manager: has_any_role(viewer) = false'
);

-- ── Tests as instructor ──────────────────────────────────────────────────────

select tests.set_auth_user('cccccccc-1111-1111-1111-000000000003'::uuid);

select is(
  public.user_role_in_org('cccccccc-1111-1111-1111-000000000001'::uuid),
  'instructor',
  'instructor: user_role_in_org returns instructor'
);
select ok(
  not public.is_manager('cccccccc-1111-1111-1111-000000000001'::uuid),
  'instructor: is_manager() = false'
);
select ok(
  public.is_instructor('cccccccc-1111-1111-1111-000000000001'::uuid),
  'instructor: is_instructor() = true'
);
select ok(
  not public.is_viewer('cccccccc-1111-1111-1111-000000000001'::uuid),
  'instructor: is_viewer() = false'
);

-- current_instructor_id: with no linked instructor row, returns NULL
select is(
  public.current_instructor_id('cccccccc-1111-1111-1111-000000000001'::uuid),
  NULL,
  'instructor: current_instructor_id is NULL when no linked instructors row'
);

-- Now link the instructor user to an instructors row and verify the helper
-- finds it.
do $$
declare
  v_dept_id uuid;
  v_inst_row_id uuid;
begin
  -- The departments + departments_memberships infra needs at least the org's
  -- "General" dept (auto-created by the departments migration). Look it up.
  select id into v_dept_id
    from public.departments
    where org_id = 'cccccccc-1111-1111-1111-000000000001'::uuid
    limit 1;

  if v_dept_id is null then
    insert into public.departments (org_id, name, slug)
      values ('cccccccc-1111-1111-1111-000000000001', 'General', 'general')
      returning id into v_dept_id;
  end if;

  insert into public.instructors (org_id, department_id, user_id, full_name, email, annual_hours, status)
    values ('cccccccc-1111-1111-1111-000000000001', v_dept_id,
            'cccccccc-1111-1111-1111-000000000003',
            'Test Instructor', 'inst-test@arbor.local', 1880, 'active')
    on conflict do nothing
    returning id into v_inst_row_id;
end $$;

select tests.set_auth_user('cccccccc-1111-1111-1111-000000000003'::uuid);

select isnt(
  public.current_instructor_id('cccccccc-1111-1111-1111-000000000001'::uuid),
  NULL,
  'instructor: current_instructor_id is non-NULL after linking'
);

-- ── Tests as viewer ──────────────────────────────────────────────────────────

select tests.set_auth_user('cccccccc-1111-1111-1111-000000000004'::uuid);

select is(
  public.user_role_in_org('cccccccc-1111-1111-1111-000000000001'::uuid),
  'viewer',
  'viewer: user_role_in_org returns viewer'
);
select ok(
  not public.is_manager('cccccccc-1111-1111-1111-000000000001'::uuid),
  'viewer: is_manager() = false'
);
select ok(
  not public.is_instructor('cccccccc-1111-1111-1111-000000000001'::uuid),
  'viewer: is_instructor() = false'
);
select ok(
  public.is_viewer('cccccccc-1111-1111-1111-000000000001'::uuid),
  'viewer: is_viewer() = true'
);

-- ── Tests as anon (no JWT claim) ────────────────────────────────────────────

select set_config('request.jwt.claim.sub', '', true);

select is(
  public.user_role_in_org('cccccccc-1111-1111-1111-000000000001'::uuid),
  NULL,
  'anon: user_role_in_org returns NULL'
);
select ok(
  not public.is_manager('cccccccc-1111-1111-1111-000000000001'::uuid),
  'anon: is_manager() = false'
);
select ok(
  not public.has_any_role('cccccccc-1111-1111-1111-000000000001'::uuid,
                          array['manager','instructor','viewer']),
  'anon: has_any_role(*) = false'
);

select * from finish();
rollback;
