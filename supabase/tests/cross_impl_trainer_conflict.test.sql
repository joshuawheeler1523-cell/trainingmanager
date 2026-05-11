-- =============================================================================
-- pgTAP — Cross-implementation trainer conflict detection
-- =============================================================================
-- Validates supabase/migrations/20260511000006_cross_impl_trainer_conflict.sql:
--   • Same trainer (linked via instructor_id) double-booked across two impls
--     in the same org → both rows end up conflict_status = 'full'.
--   • External trainers (instructor_id NULL) are NOT cross-checked.
--   • Sessions in deleted / archived / cancelled implementations don't
--     contribute to cross-impl overlap detection.
--   • Bilateral flagging: when session A is inserted first and session B
--     conflicts on insert, BOTH sessions end up flagged after the AFTER
--     trigger runs (not just the latest-inserted).
--   • Cancelled sessions don't contribute to cross-impl overlap.
--   • conflict_reason text on cross-impl includes the other impl name.
--
-- Run locally:
--   supabase start
--   supabase test db
-- =============================================================================

begin;
select plan(11);

create extension if not exists pgtap with schema extensions;

-- ── Fixture ───────────────────────────────────────────────────────────────

do $$
declare
  v_org_id  uuid := 'cccccccc-3333-3333-3333-000000000001';
  v_dept_id uuid;
  v_mgr     uuid := 'cccccccc-3333-3333-3333-000000000002';
  v_inst    uuid := 'cccccccc-3333-3333-3333-000000000003'; -- the linked instructor record
  v_impl_a  uuid := 'cccccccc-3333-3333-3333-0000000000a1';
  v_impl_b  uuid := 'cccccccc-3333-3333-3333-0000000000b1';
  v_impl_archived uuid := 'cccccccc-3333-3333-3333-0000000000c1';
begin
  insert into public.organizations (id, name, slug)
    values (v_org_id, 'CrossImpl Test Org', 'cross-impl-' || gen_random_uuid()::text)
    on conflict (id) do nothing;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
    values (v_mgr, '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', 'ci-mgr@arbor.local', '', now(), now(), now())
    on conflict (id) do nothing;

  insert into public.org_memberships (org_id, user_id, role, accepted_at)
    values (v_org_id, v_mgr, 'manager', now())
    on conflict (org_id, user_id) do update set role = excluded.role, accepted_at = now();

  -- Default department
  select id into v_dept_id
    from public.departments where org_id = v_org_id limit 1;
  if v_dept_id is null then
    insert into public.departments (org_id, name, slug)
      values (v_org_id, 'General', 'general') returning id into v_dept_id;
  end if;
  insert into public.department_memberships (department_id, user_id, role, accepted_at)
    values (v_dept_id, v_mgr, 'department_admin', now())
    on conflict (department_id, user_id) do nothing;

  -- The shared instructor that both impls' trainers will link to.
  insert into public.instructors (id, org_id, department_id, full_name, email, status)
    values (v_inst, v_org_id, v_dept_id, 'Sarah Smith', 'sarah@example.com', 'active')
    on conflict (id) do nothing;

  -- Three implementations: A and B are live; archived_impl is archived.
  insert into public.implementations (id, org_id, department_id, name,
                                      window_start_date, window_end_date, status)
    values
      (v_impl_a, v_org_id, v_dept_id, 'Site A — Wave 1',
       '2026-06-01', '2026-06-30', 'draft'),
      (v_impl_b, v_org_id, v_dept_id, 'Site B — Wave 1',
       '2026-06-01', '2026-06-30', 'draft'),
      (v_impl_archived, v_org_id, v_dept_id, 'Site C — Cancelled',
       '2026-06-01', '2026-06-30', 'archived')
    on conflict (id) do nothing;

  -- A class in each implementation.
  insert into public.impl_classes
    (id, org_id, department_id, implementation_id, name,
     hours_per_session, expected_learners_per_session, total_people_to_train)
    values
      ('cccccccc-3333-3333-3333-0000000000a2', v_org_id, v_dept_id, v_impl_a, 'EMR Provider A',
       2, 10, 0),
      ('cccccccc-3333-3333-3333-0000000000b2', v_org_id, v_dept_id, v_impl_b, 'EMR Provider B',
       2, 10, 0),
      ('cccccccc-3333-3333-3333-0000000000c2', v_org_id, v_dept_id, v_impl_archived,
       'Archived class', 2, 10, 0)
    on conflict (id) do nothing;

  -- Rooms (per-impl) with adequate capacity.
  insert into public.impl_rooms
    (id, org_id, department_id, implementation_id, name, seat_capacity)
    values
      ('cccccccc-3333-3333-3333-0000000000a3', v_org_id, v_dept_id, v_impl_a, 'Room A1', 20),
      ('cccccccc-3333-3333-3333-0000000000b3', v_org_id, v_dept_id, v_impl_b, 'Room B1', 20),
      ('cccccccc-3333-3333-3333-0000000000c3', v_org_id, v_dept_id, v_impl_archived,
       'Archived room', 20)
    on conflict (id) do nothing;

  -- Trainers: same instructor linked into both A and B; one external (NULL)
  -- in B for the external-no-cross-check test; one in the archived impl.
  insert into public.impl_trainers
    (id, org_id, department_id, implementation_id, instructor_id, name,
     availability_hours_per_week)
    values
      ('cccccccc-3333-3333-3333-0000000000a4', v_org_id, v_dept_id, v_impl_a, v_inst,
       'Sarah Smith (A)', 40),
      ('cccccccc-3333-3333-3333-0000000000b4', v_org_id, v_dept_id, v_impl_b, v_inst,
       'Sarah Smith (B)', 40),
      ('cccccccc-3333-3333-3333-0000000000b5', v_org_id, v_dept_id, v_impl_b, null,
       'External Bob', 40),
      ('cccccccc-3333-3333-3333-0000000000c4', v_org_id, v_dept_id, v_impl_archived,
       v_inst, 'Sarah Smith (archived)', 40)
    on conflict (id) do nothing;
end$$;

-- ── Test helpers ──────────────────────────────────────────────────────────

-- All asserts run as superuser inside the test transaction; RLS doesn't apply.
-- Sessions inserted manually below will trigger the BEFORE and AFTER conflict
-- triggers.

-- Clear any sessions from previous runs (idempotent fixture).
delete from public.impl_sessions where org_id = 'cccccccc-3333-3333-3333-000000000001';

-- ── 1. Single session in impl A → no conflict ──────────────────────────────
insert into public.impl_sessions
  (id, org_id, department_id, implementation_id, impl_class_id,
   impl_trainer_id, impl_room_id, scheduled_start, scheduled_end, status)
  values
  ('cccccccc-3333-3333-3333-000000000101', 'cccccccc-3333-3333-3333-000000000001',
   (select id from public.departments where org_id = 'cccccccc-3333-3333-3333-000000000001' limit 1),
   'cccccccc-3333-3333-3333-0000000000a1',  -- impl A
   'cccccccc-3333-3333-3333-0000000000a2',  -- class A
   'cccccccc-3333-3333-3333-0000000000a4',  -- Sarah in A
   'cccccccc-3333-3333-3333-0000000000a3',  -- Room A1
   '2026-06-15 09:00+00', '2026-06-15 11:00+00', 'draft');

select is(
  (select conflict_status from public.impl_sessions
   where id = 'cccccccc-3333-3333-3333-000000000101'),
  'none',
  'lone session has conflict_status = none');

-- ── 2. Cross-impl overlap → BOTH rows end up conflict_status = full ────────
insert into public.impl_sessions
  (id, org_id, department_id, implementation_id, impl_class_id,
   impl_trainer_id, impl_room_id, scheduled_start, scheduled_end, status)
  values
  ('cccccccc-3333-3333-3333-000000000102', 'cccccccc-3333-3333-3333-000000000001',
   (select id from public.departments where org_id = 'cccccccc-3333-3333-3333-000000000001' limit 1),
   'cccccccc-3333-3333-3333-0000000000b1',  -- impl B
   'cccccccc-3333-3333-3333-0000000000b2',  -- class B
   'cccccccc-3333-3333-3333-0000000000b4',  -- Sarah in B
   'cccccccc-3333-3333-3333-0000000000b3',  -- Room B1
   '2026-06-15 10:00+00', '2026-06-15 12:00+00', 'draft');

select is(
  (select conflict_status from public.impl_sessions
   where id = 'cccccccc-3333-3333-3333-000000000102'),
  'full',
  'NEW (impl B) cross-impl conflict stamped full on insert');

select is(
  (select conflict_status from public.impl_sessions
   where id = 'cccccccc-3333-3333-3333-000000000101'),
  'full',
  'PRIOR session in impl A also re-stamped full via AFTER sibling-recompute');

select like(
  (select conflict_reason from public.impl_sessions
   where id = 'cccccccc-3333-3333-3333-000000000102'),
  '%Site A — Wave 1%',
  'conflict_reason on impl B names the other implementation');

select like(
  (select conflict_reason from public.impl_sessions
   where id = 'cccccccc-3333-3333-3333-000000000101'),
  '%Site B — Wave 1%',
  'conflict_reason on impl A names the other implementation');

-- ── 3. Moving the impl B session out of overlap → both rows clear ──────────
update public.impl_sessions
  set scheduled_start = '2026-06-15 14:00+00',
      scheduled_end   = '2026-06-15 16:00+00'
  where id = 'cccccccc-3333-3333-3333-000000000102';

select is(
  (select conflict_status from public.impl_sessions
   where id = 'cccccccc-3333-3333-3333-000000000102'),
  'none',
  'moved session clears its own conflict');

select is(
  (select conflict_status from public.impl_sessions
   where id = 'cccccccc-3333-3333-3333-000000000101'),
  'none',
  'previously-conflicting sibling in impl A clears via AFTER sibling-recompute');

-- ── 4. External trainer (instructor_id NULL) is NOT cross-checked ──────────
-- Move impl A session to 09:00 again, then insert an external-trainer session
-- in impl B at the same time. Cross-impl branch should not fire.
update public.impl_sessions
  set scheduled_start = '2026-06-15 09:00+00',
      scheduled_end   = '2026-06-15 11:00+00'
  where id = 'cccccccc-3333-3333-3333-000000000101';

insert into public.impl_sessions
  (id, org_id, department_id, implementation_id, impl_class_id,
   impl_trainer_id, impl_room_id, scheduled_start, scheduled_end, status)
  values
  ('cccccccc-3333-3333-3333-000000000103', 'cccccccc-3333-3333-3333-000000000001',
   (select id from public.departments where org_id = 'cccccccc-3333-3333-3333-000000000001' limit 1),
   'cccccccc-3333-3333-3333-0000000000b1',
   'cccccccc-3333-3333-3333-0000000000b2',
   'cccccccc-3333-3333-3333-0000000000b5',  -- external Bob, NULL instructor_id
   'cccccccc-3333-3333-3333-0000000000b3',
   '2026-06-15 09:30+00', '2026-06-15 11:30+00', 'draft');

select is(
  (select conflict_status from public.impl_sessions
   where id = 'cccccccc-3333-3333-3333-000000000103'),
  'none',
  'external trainer (NULL instructor_id) is NOT cross-conflict-checked');

select is(
  (select conflict_status from public.impl_sessions
   where id = 'cccccccc-3333-3333-3333-000000000101'),
  'none',
  'impl A session unaffected by external trainer in impl B');

-- ── 5. Archived implementation sessions don't contribute to cross-impl ─────
-- Insert a session in the archived impl at the same time as impl A's session.
-- It should not flag impl A.
delete from public.impl_sessions where id = 'cccccccc-3333-3333-3333-000000000103';

insert into public.impl_sessions
  (id, org_id, department_id, implementation_id, impl_class_id,
   impl_trainer_id, impl_room_id, scheduled_start, scheduled_end, status)
  values
  ('cccccccc-3333-3333-3333-000000000104', 'cccccccc-3333-3333-3333-000000000001',
   (select id from public.departments where org_id = 'cccccccc-3333-3333-3333-000000000001' limit 1),
   'cccccccc-3333-3333-3333-0000000000c1',  -- archived impl
   'cccccccc-3333-3333-3333-0000000000c2',
   'cccccccc-3333-3333-3333-0000000000c4',  -- Sarah in archived
   'cccccccc-3333-3333-3333-0000000000c3',
   '2026-06-15 09:30+00', '2026-06-15 11:30+00', 'draft');

select is(
  (select conflict_status from public.impl_sessions
   where id = 'cccccccc-3333-3333-3333-000000000101'),
  'none',
  'impl A session unaffected by overlapping session in archived implementation');

-- ── 6. Cancelled sessions don't contribute to cross-impl overlap ───────────
delete from public.impl_sessions where id = 'cccccccc-3333-3333-3333-000000000104';

insert into public.impl_sessions
  (id, org_id, department_id, implementation_id, impl_class_id,
   impl_trainer_id, impl_room_id, scheduled_start, scheduled_end, status)
  values
  ('cccccccc-3333-3333-3333-000000000105', 'cccccccc-3333-3333-3333-000000000001',
   (select id from public.departments where org_id = 'cccccccc-3333-3333-3333-000000000001' limit 1),
   'cccccccc-3333-3333-3333-0000000000b1',
   'cccccccc-3333-3333-3333-0000000000b2',
   'cccccccc-3333-3333-3333-0000000000b4',  -- Sarah in B
   'cccccccc-3333-3333-3333-0000000000b3',
   '2026-06-15 10:00+00', '2026-06-15 12:00+00', 'cancelled');

select is(
  (select conflict_status from public.impl_sessions
   where id = 'cccccccc-3333-3333-3333-000000000101'),
  'none',
  'impl A session unaffected by overlapping CANCELLED session in impl B');

select * from finish();
rollback;
