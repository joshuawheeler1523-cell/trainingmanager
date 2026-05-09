-- Phase 6.1 — Special Projects: team, task assignments, action items.
--
-- Adds the project-management surface on top of the minimal projects/tasks
-- tables created in Phase 4.1. Also extends v_instructor_workload with
-- Source 7 (project_task) — task_assignments × tasks × projects, only when
-- the project + task are still active.

-- ── project_team_members ─────────────────────────────────────────────────────
-- Roster of instructors assigned to a project. allocated_hours is the high-
-- level project budget for this person; per-task drawdown lives in
-- task_assignments below.

create table public.project_team_members (
  id              uuid          not null default gen_random_uuid() primary key,
  org_id          uuid          not null references public.organizations(id) on delete cascade,
  project_id      uuid          not null references public.projects(id) on delete cascade,
  instructor_id   uuid          not null references public.instructors(id) on delete cascade,
  role            text          not null default 'member'
                    check (role in ('lead','member','reviewer')),
  allocated_hours numeric(7,2)  not null default 0 check (allocated_hours >= 0),
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now(),
  created_by      uuid          references auth.users(id) on delete set null,
  updated_by      uuid          references auth.users(id) on delete set null,
  version         integer       not null default 1,
  unique (project_id, instructor_id)
);

create index on public.project_team_members (project_id);
create index on public.project_team_members (instructor_id);
create index on public.project_team_members (org_id);

alter table public.project_team_members enable row level security;

create policy "project_team_members_select" on public.project_team_members
  for select using (org_id in (select public.user_org_ids()));

create policy "project_team_members_modify" on public.project_team_members
  for all using (org_id in (select public.user_org_ids()))
  with check (org_id in (select public.user_org_ids()));

select public.apply_standard_triggers('project_team_members');

create trigger set_actor_audit_fields
  before insert or update on public.project_team_members
  for each row execute function public.set_actor_audit_fields();

create trigger bump_version
  before update on public.project_team_members
  for each row execute function public.bump_version();

-- ── task_assignments ─────────────────────────────────────────────────────────
-- Per-task allocation: which team member is doing the task and how many hours
-- they're estimating. References project_team_members so a person can only be
-- assigned to a task on a project they're a member of.

create table public.task_assignments (
  id                      uuid          not null default gen_random_uuid() primary key,
  org_id                  uuid          not null references public.organizations(id) on delete cascade,
  task_id                 uuid          not null references public.tasks(id) on delete cascade,
  project_team_member_id  uuid          not null references public.project_team_members(id) on delete cascade,
  allocated_hours         numeric(7,2)  not null default 0 check (allocated_hours >= 0),
  created_at              timestamptz   not null default now(),
  updated_at              timestamptz   not null default now(),
  created_by              uuid          references auth.users(id) on delete set null,
  updated_by              uuid          references auth.users(id) on delete set null,
  unique (task_id, project_team_member_id)
);

create index on public.task_assignments (task_id);
create index on public.task_assignments (project_team_member_id);
create index on public.task_assignments (org_id);

alter table public.task_assignments enable row level security;

create policy "task_assignments_select" on public.task_assignments
  for select using (org_id in (select public.user_org_ids()));

create policy "task_assignments_modify" on public.task_assignments
  for all using (org_id in (select public.user_org_ids()))
  with check (org_id in (select public.user_org_ids()));

select public.apply_standard_triggers('task_assignments');

create trigger set_actor_audit_fields
  before insert or update on public.task_assignments
  for each row execute function public.set_actor_audit_fields();

-- ── task_action_items ────────────────────────────────────────────────────────
-- Lightweight checklist items inside a task. Optionally assigned to a team
-- member; doesn't roll up to workload (that's what tasks are for).

create table public.task_action_items (
  id                              uuid          not null default gen_random_uuid() primary key,
  org_id                          uuid          not null references public.organizations(id) on delete cascade,
  task_id                         uuid          not null references public.tasks(id) on delete cascade,
  description                     text          not null,
  assigned_to_team_member_id      uuid          references public.project_team_members(id) on delete set null,
  is_complete                     boolean       not null default false,
  completed_at                    timestamptz,
  due_date                        date,
  sort_order                      integer       not null default 0,
  created_at                      timestamptz   not null default now(),
  updated_at                      timestamptz   not null default now(),
  created_by                      uuid          references auth.users(id) on delete set null,
  updated_by                      uuid          references auth.users(id) on delete set null,
  version                         integer       not null default 1
);

create index on public.task_action_items (task_id, sort_order);
create index on public.task_action_items (assigned_to_team_member_id);
create index on public.task_action_items (org_id);

alter table public.task_action_items enable row level security;

create policy "task_action_items_select" on public.task_action_items
  for select using (org_id in (select public.user_org_ids()));

create policy "task_action_items_modify" on public.task_action_items
  for all using (org_id in (select public.user_org_ids()))
  with check (org_id in (select public.user_org_ids()));

select public.apply_standard_triggers('task_action_items');

create trigger set_actor_audit_fields
  before insert or update on public.task_action_items
  for each row execute function public.set_actor_audit_fields();

create trigger bump_version
  before update on public.task_action_items
  for each row execute function public.bump_version();

-- Auto-stamp completed_at when is_complete flips true (and clear when reset).
create or replace function public.set_action_item_completed_at()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.is_complete then
      new.completed_at := coalesce(new.completed_at, now());
    end if;
    return new;
  end if;

  if old.is_complete is distinct from new.is_complete then
    new.completed_at := case when new.is_complete then now() else null end;
  end if;
  return new;
end;
$$;

create trigger set_action_item_completed_at
  before insert or update on public.task_action_items
  for each row execute function public.set_action_item_completed_at();

-- ── Extend v_instructor_workload with Source 7 (project_task) ───────────────
-- Hours come from task_assignments.allocated_hours. Only contributes when:
--   - Project is planning/active (not on_hold/completed/cancelled)
--   - Task is not_started/in_progress (not on_hold/completed)
-- This keeps finished or paused work from counting against capacity.

create or replace view public.v_instructor_workload as
-- Source 1: Classes
select
  c.org_id                as org_id,
  cia.instructor_id       as instructor_id,
  'class'                 as source,
  c.id                    as source_id,
  c.name                  as source_label,
  cia.assigned_offerings  as quantity,
  ((case when c.is_multi_day and c.custom_day_hours is not null
      then (select sum(h) from unnest(c.custom_day_hours) h)
      else coalesce(c.hours_per_day, 0) * c.total_days end)
   + c.prep_hours_per_offering + c.logistics_hours_per_offering
  ) * cia.assigned_offerings as annual_hours,
  c.allocation_bucket_id  as bucket_id
from public.class_instructor_assignments cia
join public.classes c on c.id = cia.class_id and c.deleted_at is null
where cia.assigned_offerings > 0

union all
-- Source 2: Recurring tasks
select
  rt.org_id,
  rta.instructor_id,
  'recurring_task',
  rt.id,
  rt.name,
  null::integer,
  rt.hours_per_occurrence
    * coalesce(rt.occurrences_per_year, public.frequency_to_annual(rt.frequency))
    * (rta.share_percent / 100.0),
  rt.bucket_id
from public.recurring_task_assignments rta
join public.recurring_tasks rt
  on rt.id = rta.recurring_task_id
 and rt.deleted_at is null
where rt.status = 'active'

union all
-- Source 5: Ad-hoc tasks
select
  aht.org_id,
  aht.instructor_id,
  'ad_hoc_task',
  aht.id,
  aht.name,
  null::integer,
  aht.hours,
  aht.bucket_id
from public.ad_hoc_tasks aht
where aht.instructor_id is not null
  and aht.status in ('open','in_progress')

union all
-- Source 6: Education request assignments
select
  era.org_id,
  era.instructor_id,
  'education_request',
  er.id,
  er.title,
  null::integer,
  era.estimated_hours,
  null::uuid                          as bucket_id
from public.education_request_assignments era
join public.education_requests er
  on er.id = era.request_id
 and er.deleted_at is null
where er.status in ('approved','assigned','in_progress')

union all
-- Source 7: Project tasks (NEW in Phase 6.1)
select
  ta.org_id,
  ptm.instructor_id,
  'project_task',
  t.id,
  p.name || ' · ' || t.name      as source_label,
  null::integer                  as quantity,
  ta.allocated_hours,
  p.bucket_id
from public.task_assignments ta
join public.project_team_members ptm on ptm.id = ta.project_team_member_id
join public.tasks t on t.id = ta.task_id
join public.projects p on p.id = t.project_id and p.deleted_at is null
where p.status in ('planning','active')
  and t.status in ('not_started','in_progress');
