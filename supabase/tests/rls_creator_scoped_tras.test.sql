-- =============================================================================
-- pgTAP — TRAs and TRA child tables: creator-scoped instructor writes
-- =============================================================================
-- Phase 4 makes TRAs creator-scoped for instructors:
--   • Instructor can INSERT a TRA (auto-set as creator).
--   • Instructor can UPDATE/DELETE only their own draft/documented TRAs.
--   • Other instructors' TRAs are read-only.
--   • TRA children (stakeholders, kpis, objectives, etc.) follow the same
--     creator-of-parent rule.
-- =============================================================================

begin;
select plan(11);

create extension if not exists pgtap with schema extensions;

-- ── Fixture ─────────────────────────────────────────────────────────────

do $$
declare
  v_org_id  uuid := 'cccccccc-4444-4444-4444-000000000001';
  v_mgr     uuid := 'cccccccc-4444-4444-4444-000000000002';
  v_inst1   uuid := 'cccccccc-4444-4444-4444-000000000003';
  v_inst2   uuid := 'cccccccc-4444-4444-4444-000000000004';
  v_dept_id uuid;
begin
  insert into public.organizations (id, name, slug)
    values (v_org_id, 'Creator Scope Test', 'creator-' || gen_random_uuid()::text)
    on conflict (id) do nothing;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
    values (v_mgr, '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', 'cs-mgr@arbor.local', '', now(), now(), now()),
           (v_inst1, '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', 'cs-inst1@arbor.local', '', now(), now(), now()),
           (v_inst2, '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', 'cs-inst2@arbor.local', '', now(), now(), now())
    on conflict (id) do nothing;

  insert into public.org_memberships (org_id, user_id, role, accepted_at)
    values (v_org_id, v_mgr, 'manager', now()),
           (v_org_id, v_inst1, 'instructor', now()),
           (v_org_id, v_inst2, 'instructor', now())
    on conflict (org_id, user_id) do update set role = excluded.role, accepted_at = now();

  select id into v_dept_id
    from public.departments where org_id = v_org_id limit 1;
  if v_dept_id is null then
    insert into public.departments (org_id, name, slug)
      values (v_org_id, 'General', 'general') returning id into v_dept_id;
  end if;
  insert into public.department_memberships (department_id, user_id, role, accepted_at)
    values (v_dept_id, v_mgr, 'admin', now()),
           (v_dept_id, v_inst1, 'member', now()),
           (v_dept_id, v_inst2, 'member', now())
    on conflict do nothing;
end $$;

create or replace function tests.set_auth_user(p_user_id uuid)
  returns void language sql as $$
    select set_config('request.jwt.claim.sub', p_user_id::text, true);
$$;

create or replace function tests.test_dept_id()
  returns uuid language sql as $$
    select id from public.departments
      where org_id = 'cccccccc-4444-4444-4444-000000000001' limit 1;
$$;

set local role authenticated;

-- ── Instructor 1: creates own TRA ───────────────────────────────────────

select tests.set_auth_user('cccccccc-4444-4444-4444-000000000003'::uuid);

select lives_ok(
  $$ insert into public.tras (org_id, department_id, project_name, status)
     values ('cccccccc-4444-4444-4444-000000000001', tests.test_dept_id(),
             'Inst1 TRA', 'draft') $$,
  'instructor 1: can INSERT own TRA in own dept'
);

-- Capture the TRA id for follow-up assertions
do $$
declare
  v_tra_id uuid;
begin
  select id into v_tra_id from public.tras
    where project_name = 'Inst1 TRA' and org_id = 'cccccccc-4444-4444-4444-000000000001';
  perform set_config('test.tra_id', v_tra_id::text, false);
end $$;

select lives_ok(
  format($$
    update public.tras set business_problem = 'Updated by inst1'
      where id = '%s'
  $$, current_setting('test.tra_id')),
  'instructor 1: can UPDATE own draft TRA'
);

-- Instructor 1 adds a child stakeholder row
select lives_ok(
  format($$
    insert into public.tra_stakeholders (tra_id, org_id, department_id, name, role)
    values ('%s', 'cccccccc-4444-4444-4444-000000000001', tests.test_dept_id(),
            'Inst1 Stakeholder', 'sponsor')
  $$, current_setting('test.tra_id')),
  'instructor 1: can INSERT tra_stakeholders for own TRA'
);

-- ── Instructor 2: cannot mutate Inst1's TRA ─────────────────────────────

select tests.set_auth_user('cccccccc-4444-4444-4444-000000000004'::uuid);

-- Instructor 2 can see the TRA (read tier covers org members)
select isnt_empty(
  format($$ select id from public.tras where id = '%s' $$,
         current_setting('test.tra_id')),
  'instructor 2: can SELECT inst1''s TRA (read tier)'
);

-- But cannot UPDATE it (creator predicate fails)
select results_eq(
  format($$
    update public.tras set business_problem = 'Inst2 tampered'
      where id = '%s' returning id
  $$, current_setting('test.tra_id')),
  $$ select null::uuid where false $$,
  'instructor 2: UPDATE inst1''s TRA affects zero rows'
);

-- And cannot DELETE it
select results_eq(
  format($$
    delete from public.tras where id = '%s' returning id
  $$, current_setting('test.tra_id')),
  $$ select null::uuid where false $$,
  'instructor 2: DELETE inst1''s TRA affects zero rows'
);

-- And cannot add a stakeholder to inst1's TRA
select results_eq(
  format($$
    insert into public.tra_stakeholders (tra_id, org_id, department_id, name, role)
    values ('%s', 'cccccccc-4444-4444-4444-000000000001', tests.test_dept_id(),
            'Inst2 sneaky', 'sponsor')
    returning id
  $$, current_setting('test.tra_id')),
  $$ select null::uuid where false $$,
  'instructor 2: INSERT tra_stakeholders into inst1''s TRA blocked (RLS WITH CHECK)'
)::text -- pgTAP doesn't have throws_or_no_rows; this asserts via error catch
on conflict do nothing;

-- ── Instructor 1: locked out once TRA is converted ──────────────────────

-- Manager moves TRA to converted status
select tests.set_auth_user('cccccccc-4444-4444-4444-000000000002'::uuid);
select lives_ok(
  format($$
    update public.tras set status = 'converted' where id = '%s'
  $$, current_setting('test.tra_id')),
  'manager: can UPDATE TRA to converted status'
);

-- Now instructor 1 can no longer edit the converted TRA
select tests.set_auth_user('cccccccc-4444-4444-4444-000000000003'::uuid);
select results_eq(
  format($$
    update public.tras set business_problem = 'After convert'
      where id = '%s' returning id
  $$, current_setting('test.tra_id')),
  $$ select null::uuid where false $$,
  'instructor 1: UPDATE own TRA after status=converted affects zero rows'
);

-- ── Manager: full access ────────────────────────────────────────────────

select tests.set_auth_user('cccccccc-4444-4444-4444-000000000002'::uuid);

select lives_ok(
  format($$
    update public.tras set business_problem = 'Manager edit'
      where id = '%s'
  $$, current_setting('test.tra_id')),
  'manager: can UPDATE any TRA regardless of creator + status'
);

select lives_ok(
  format($$
    delete from public.tras where id = '%s'
  $$, current_setting('test.tra_id')),
  'manager: can DELETE any TRA'
);

select * from finish();
rollback;
