-- =============================================================================
-- Departments — sub-org isolation layer
-- =============================================================================
-- Adds a "department" concept inside each organization so distinct teams
-- (e.g., Clinical Education vs Revenue Cycle Training) can manage their own
-- instructors, classes, allocations, projects, etc. with zero blending.
--
-- Decisions locked with the user:
--   • One instructor belongs to exactly one department (no cross-dept sharing).
--   • Skills catalog is PER-DEPARTMENT (not org-shared).
--   • A logged-in user can be a member of multiple departments and switch.
--   • Departments are scoped to a single org (departments.org_id FK).
--
-- Strategy:
--   1. Create departments + department_memberships tables.
--   2. Create a "General" department for every existing org and auto-grant
--      access to all current org members (so nothing breaks for live data).
--   3. Add nullable department_id columns to 39 tenant-scoped tables.
--   4. Backfill department_id = General-of-(row.org_id) on every row.
--   5. Make department_id NOT NULL with FK ON DELETE CASCADE; index it.
--   6. Helper functions for RLS (user_department_ids, etc.) — RLS policy
--      updates land in a follow-up migration.
--
-- Tables that intentionally stay org-only (no department_id):
--   audit_log, deliverable_types, feature_flags, notifications,
--   org_invitations, org_memberships, support_tickets, support_ticket_messages
-- =============================================================================

-- ── 1. Tables ────────────────────────────────────────────────────────────────

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, slug)
);

create index on public.departments(org_id);

create table public.department_memberships (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Department-level role. Org admins implicitly see all departments in their
  -- org regardless of department_memberships entries.
  role text not null default 'member' check (role in ('member', 'department_admin')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (department_id, user_id)
);

create index on public.department_memberships(user_id);
create index on public.department_memberships(department_id);

-- ── 2. Backfill: create "General" department per existing org ────────────────

insert into public.departments (org_id, name, slug, description)
select id, 'General', 'general',
  'Auto-created during the multi-department migration. All pre-existing data was assigned to this department.'
from public.organizations
on conflict (org_id, slug) do nothing;

-- Grant every existing accepted org member access to the General department.
-- Org admins become department_admins on General.
insert into public.department_memberships (department_id, user_id, role, accepted_at)
select
  d.id,
  om.user_id,
  case when om.role = 'org_admin' then 'department_admin' else 'member' end,
  now()
from public.org_memberships om
join public.departments d on d.org_id = om.org_id and d.slug = 'general'
where om.accepted_at is not null
on conflict (department_id, user_id) do nothing;

-- ── 3. Helper macro: add department_id to a table, backfill, lock NOT NULL ───
-- We unfortunately have to write each table out longhand — Postgres doesn't
-- have first-class table-list parameterisation in DDL.

create or replace function pg_temp.add_department_id(p_table text)
returns void
language plpgsql as $$
begin
  execute format('alter table public.%I add column department_id uuid', p_table);
  execute format($q$
    update public.%I t
    set department_id = d.id
    from public.departments d
    where d.org_id = t.org_id and d.slug = 'general'
  $q$, p_table);
  execute format('alter table public.%I alter column department_id set not null', p_table);
  execute format($q$
    alter table public.%I add constraint %I
      foreign key (department_id) references public.departments(id) on delete cascade
  $q$, p_table, p_table || '_department_id_fkey');
  execute format('create index on public.%I(department_id)', p_table);
end;
$$;

-- ── 4. Apply to every tenant-scoped table ────────────────────────────────────

-- Directory
select pg_temp.add_department_id('instructors');
select pg_temp.add_department_id('skills');
select pg_temp.add_department_id('instructor_skills');
select pg_temp.add_department_id('classes');
select pg_temp.add_department_id('class_instructor_assignments');
select pg_temp.add_department_id('class_skill_requirements');

-- Allocations
select pg_temp.add_department_id('allocation_buckets');
select pg_temp.add_department_id('global_allocations');
select pg_temp.add_department_id('allocation_groups');
select pg_temp.add_department_id('allocation_group_members');
select pg_temp.add_department_id('group_allocations');
select pg_temp.add_department_id('individual_allocations');
select pg_temp.add_department_id('recurring_tasks');
select pg_temp.add_department_id('recurring_task_assignments');
select pg_temp.add_department_id('ad_hoc_tasks');

-- TRAs
select pg_temp.add_department_id('tras');
select pg_temp.add_department_id('tra_deliverables');

-- Projects
select pg_temp.add_department_id('projects');
select pg_temp.add_department_id('tasks');
select pg_temp.add_department_id('milestones');
select pg_temp.add_department_id('task_dependencies');
select pg_temp.add_department_id('dependencies');
select pg_temp.add_department_id('project_team_members');
select pg_temp.add_department_id('task_assignments');
select pg_temp.add_department_id('task_action_items');

-- Implementations / training planner
select pg_temp.add_department_id('implementations');
select pg_temp.add_department_id('impl_modules');
select pg_temp.add_department_id('impl_classes');
select pg_temp.add_department_id('impl_rooms');
select pg_temp.add_department_id('impl_trainers');
select pg_temp.add_department_id('impl_sessions');
select pg_temp.add_department_id('impl_class_prerequisites');
select pg_temp.add_department_id('impl_class_trainers');

-- Reports
select pg_temp.add_department_id('saved_reports');
select pg_temp.add_department_id('report_runs');

-- Education requests
select pg_temp.add_department_id('education_requests');
select pg_temp.add_department_id('education_request_assignments');
select pg_temp.add_department_id('education_request_history');
select pg_temp.add_department_id('public_intake_links');

-- ── 5. Helper functions for RLS / app code ───────────────────────────────────

-- All department_ids the current authed user has accepted access to.
create or replace function public.user_department_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select department_id
  from public.department_memberships
  where user_id = auth.uid() and accepted_at is not null
$$;

-- True if the user is admin of the department OR org_admin of the dept's org.
create or replace function public.is_department_admin(p_department_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    exists (
      select 1
      from public.department_memberships dm
      where dm.department_id = p_department_id
        and dm.user_id = auth.uid()
        and dm.role = 'department_admin'
        and dm.accepted_at is not null
    )
    or exists (
      select 1
      from public.departments d
      join public.org_memberships om on om.org_id = d.org_id
      where d.id = p_department_id
        and om.user_id = auth.uid()
        and om.role = 'org_admin'
        and om.accepted_at is not null
    )
$$;

-- Resolve a department_id given an org_id, returning the General dept by
-- default. Used by the app's getCurrentDepartmentId() fallback.
create or replace function public.default_department_for_org(p_org_id uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select id from public.departments
  where org_id = p_org_id and slug = 'general'
  order by created_at asc
  limit 1
$$;

-- ── 6. RLS scaffolding on the new tables ─────────────────────────────────────
-- (Detailed RLS policy updates on existing tables come in the next migration.
-- For the new tables, we just need basic SELECT / INSERT policies.)

alter table public.departments enable row level security;
alter table public.department_memberships enable row level security;

-- Members of any department in the org can see the org's departments. (Org
-- admins see all; department members see at least their own.)
create policy "members can see departments in their orgs"
  on public.departments
  for select
  using (
    org_id in (select org_id from public.org_memberships
               where user_id = auth.uid() and accepted_at is not null)
  );

-- Org admins create / update / delete departments.
create policy "org admins manage departments"
  on public.departments
  for all
  using (is_org_admin(org_id))
  with check (is_org_admin(org_id));

-- A user sees their own department membership rows; org admins see all in
-- their org's departments.
create policy "users see relevant department memberships"
  on public.department_memberships
  for select
  using (
    user_id = auth.uid()
    or department_id in (
      select d.id from public.departments d
      where is_org_admin(d.org_id)
    )
  );

-- Org admins or department admins manage memberships.
create policy "admins manage department memberships"
  on public.department_memberships
  for all
  using (
    department_id in (
      select d.id from public.departments d
      where is_org_admin(d.org_id) or is_department_admin(d.id)
    )
  )
  with check (
    department_id in (
      select d.id from public.departments d
      where is_org_admin(d.org_id) or is_department_admin(d.id)
    )
  );
