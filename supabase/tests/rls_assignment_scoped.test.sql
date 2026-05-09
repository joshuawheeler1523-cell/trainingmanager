-- =============================================================================
-- pgTAP — Assignment-scoped tables: tasks, task_action_items
-- =============================================================================
-- Phase 4 lets instructors update tasks they're assigned to (via
-- task_assignments → project_team_members → instructors.user_id).
-- Column ACL trigger restricts what columns can change.
-- =============================================================================

begin;
select plan(8);

create extension if not exists pgtap with schema extensions;

-- ── Fixture ─────────────────────────────────────────────────────────────

do $$
declare
  v_org_id  uuid := 'cccccccc-5555-5555-5555-000000000001';
  v_mgr     uuid := 'cccccccc-5555-5555-5555-000000000002';
  v_inst1   uuid := 'cccccccc-5555-5555-5555-000000000003';
  v_inst2   uuid := 'cccccccc-5555-5555-5555-000000000004';
  v_dept_id uuid;
  v_inst1_row uuid;
  v_inst2_row uuid;
  v_proj_id uuid;
  v_ptm1_id uuid;
  v_task1_id uuid;
  v_task2_id uuid;
begin
  insert into public.organizations (id, name, slug)
    values (v_org_id, 'Assignment Scope Test', 'assn-' || gen_random_uuid()::text)
    on conflict (id) do nothing;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
    values (v_mgr, '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', 'as-mgr@arbor.local', '', now(), now(), now()),
           (v_inst1, '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', 'as-inst1@arbor.local', '', now(), now(), now()),
           (v_inst2, '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', 'as-inst2@arbor.local', '', now(), now(), now())
    on conflict (id) do nothing;

  insert into public.org_memberships (org_id, user_id, role, accepted_at)
    values (v_org_id, v_mgr, 'manager', now()),
           (v_org_id, v_inst1, 'instructor', now()),
           (v_org_id, v_inst2, 'instructor', now())
    on conflict (org_id, user_id) do update set role = excluded.role, accepted_at = now();

  select id into v_dept_id from public.departments where org_id = v_org_id limit 1;
  if v_dept_id is null then
    insert into public.departments (org_id, name, slug)
      values (v_org_id, 'General', 'general') returning id into v_dept_id;
  end if;
  insert into public.department_memberships (department_id, user_id, role, accepted_at)
    values (v_dept_id, v_mgr, 'admin', now()),
           (v_dept_id, v_inst1, 'member', now()),
           (v_dept_id, v_inst2, 'member', now())
    on conflict do nothing;

  -- Two instructor rows linked to the two instructor users
  insert into public.instructors (org_id, department_id, user_id, full_name, email,
                                  annual_hours, status)
    values (v_org_id, v_dept_id, v_inst1, 'Inst1', 'as-inst1@arbor.local', 1880, 'active')
    returning id into v_inst1_row;
  insert into public.instructors (org_id, department_id, user_id, full_name, email,
                                  annual_hours, status)
    values (v_org_id, v_dept_id, v_inst2, 'Inst2', 'as-inst2@arbor.local', 1880, 'active')
    returning id into v_inst2_row;

  -- Project, team membership for inst1, and two tasks
  insert into public.projects (org_id, department_id, name, status)
    values (v_org_id, v_dept_id, 'AS Project', 'active')
    returning id into v_proj_id;

  insert into public.project_team_members (org_id, department_id, project_id, instructor_id, role)
    values (v_org_id, v_dept_id, v_proj_id, v_inst1_row, 'lead')
    returning id into v_ptm1_id;

  insert into public.tasks (org_id, department_id, project_id, name, status, percent_complete)
    values (v_org_id, v_dept_id, v_proj_id, 'Assigned to Inst1', 'not_started', 0)
    returning id into v_task1_id;

  insert into public.tasks (org_id, department_id, project_id, name, status, percent_complete)
    values (v_org_id, v_dept_id, v_proj_id, 'Not assigned', 'not_started', 0)
    returning id into v_task2_id;

  insert into public.task_assignments (org_id, department_id, task_id, project_team_member_id, allocated_hours)
    values (v_org_id, v_dept_id, v_task1_id, v_ptm1_id, 8);

  perform set_config('test.task1_id', v_task1_id::text, false);
  perform set_config('test.task2_id', v_task2_id::text, false);
end $$;

create or replace function tests.set_auth_user(p_user_id uuid)
  returns void language sql as $$
    select set_config('request.jwt.claim.sub', p_user_id::text, true);
$$;

set local role authenticated;

-- ── Instructor 1 (assigned to task1): can update status + percent_complete

select tests.set_auth_user('cccccccc-5555-5555-5555-000000000003'::uuid);

select lives_ok(
  format($$
    update public.tasks set status = 'in_progress', percent_complete = 25
      where id = '%s'
  $$, current_setting('test.task1_id')),
  'instructor 1: can UPDATE assigned task status + percent_complete'
);

-- But cannot change name (column ACL trigger)
select throws_ok(
  format($$
    update public.tasks set name = 'Inst1 renamed'
      where id = '%s'
  $$, current_setting('test.task1_id')),
  'instructor cannot change name',
  'instructor 1: column ACL blocks UPDATE of task.name'
);

-- And cannot UPDATE the unassigned task at all (RLS predicate fails)
select results_eq(
  format($$
    update public.tasks set status = 'in_progress'
      where id = '%s' returning id
  $$, current_setting('test.task2_id')),
  $$ select null::uuid where false $$,
  'instructor 1: UPDATE unassigned task affects zero rows'
);

-- ── Instructor 2 (no assignments): cannot UPDATE either task ────────────

select tests.set_auth_user('cccccccc-5555-5555-5555-000000000004'::uuid);

select results_eq(
  format($$
    update public.tasks set status = 'completed'
      where id = '%s' returning id
  $$, current_setting('test.task1_id')),
  $$ select null::uuid where false $$,
  'instructor 2: UPDATE inst1''s assigned task affects zero rows'
);

-- Inst2 can still SELECT it (read tier)
select isnt_empty(
  format($$ select id from public.tasks where id = '%s' $$,
         current_setting('test.task1_id')),
  'instructor 2: SELECT task1 still works (read tier)'
);

-- ── Manager: can do anything ────────────────────────────────────────────

select tests.set_auth_user('cccccccc-5555-5555-5555-000000000002'::uuid);

select lives_ok(
  format($$
    update public.tasks set name = 'Manager renamed'
      where id = '%s'
  $$, current_setting('test.task1_id')),
  'manager: can UPDATE name (column ACL bypassed for managers)'
);

select lives_ok(
  format($$
    insert into public.task_action_items (org_id, department_id, task_id, title, is_complete)
    values ('cccccccc-5555-5555-5555-000000000001',
            (select id from public.departments where org_id = 'cccccccc-5555-5555-5555-000000000001' limit 1),
            '%s', 'Manager item', false)
  $$, current_setting('test.task1_id')),
  'manager: can INSERT task_action_items'
);

-- Instructor 1 (assigned) can also create action items on their assigned task
select tests.set_auth_user('cccccccc-5555-5555-5555-000000000003'::uuid);

select lives_ok(
  format($$
    insert into public.task_action_items (org_id, department_id, task_id, title, is_complete)
    values ('cccccccc-5555-5555-5555-000000000001',
            (select id from public.departments where org_id = 'cccccccc-5555-5555-5555-000000000001' limit 1),
            '%s', 'Inst1 item', false)
  $$, current_setting('test.task1_id')),
  'instructor 1: can INSERT task_action_items on assigned task'
);

select * from finish();
rollback;
