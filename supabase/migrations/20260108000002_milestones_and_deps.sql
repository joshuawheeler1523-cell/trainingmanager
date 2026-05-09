-- Phase 6.2 — Milestones + task dependencies. Used by the Gantt view's
-- diamonds (milestones) and curved arrows (task_dependencies).

-- ── milestones ───────────────────────────────────────────────────────────────
-- A milestone is a date marker on a project. Tasks can optionally roll up to
-- a milestone (tasks.milestone_id added below) so the Gantt can group rows.

create table public.milestones (
  id           uuid          not null default gen_random_uuid() primary key,
  org_id       uuid          not null references public.organizations(id) on delete cascade,
  project_id   uuid          not null references public.projects(id) on delete cascade,
  name         text          not null,
  description  text,
  due_date     date          not null,
  is_complete  boolean       not null default false,
  completed_at timestamptz,
  sort_order   integer       not null default 0,
  created_at   timestamptz   not null default now(),
  updated_at   timestamptz   not null default now(),
  created_by   uuid          references auth.users(id) on delete set null,
  updated_by   uuid          references auth.users(id) on delete set null,
  version      integer       not null default 1
);

create index on public.milestones (project_id, sort_order);
create index on public.milestones (project_id, due_date);
create index on public.milestones (org_id);

alter table public.milestones enable row level security;

create policy "milestones_select" on public.milestones
  for select using (org_id in (select public.user_org_ids()));

create policy "milestones_modify" on public.milestones
  for all using (org_id in (select public.user_org_ids()))
  with check (org_id in (select public.user_org_ids()));

select public.apply_standard_triggers('milestones');

create trigger set_actor_audit_fields
  before insert or update on public.milestones
  for each row execute function public.set_actor_audit_fields();

create trigger bump_version
  before update on public.milestones
  for each row execute function public.bump_version();

-- Auto-stamp completed_at when is_complete flips (mirrors task_action_items).
create or replace function public.set_milestone_completed_at()
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

create trigger set_milestone_completed_at
  before insert or update on public.milestones
  for each row execute function public.set_milestone_completed_at();

-- Optional milestone_id on tasks (groups rows in the Gantt).
alter table public.tasks
  add column milestone_id uuid references public.milestones(id) on delete set null;

create index on public.tasks (milestone_id);

-- ── task_dependencies ───────────────────────────────────────────────────────
-- "predecessor must finish before successor starts" (finish-to-start). Other
-- dependency types (FF, SF, SS) are out of scope for v1.

create table public.task_dependencies (
  id              uuid          not null default gen_random_uuid() primary key,
  org_id          uuid          not null references public.organizations(id) on delete cascade,
  predecessor_id  uuid          not null references public.tasks(id) on delete cascade,
  successor_id    uuid          not null references public.tasks(id) on delete cascade,
  dep_type        text          not null default 'finish_to_start'
                    check (dep_type in ('finish_to_start','start_to_start','finish_to_finish','start_to_finish')),
  lag_days        integer       not null default 0,
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now(),
  created_by      uuid          references auth.users(id) on delete set null,
  updated_by      uuid          references auth.users(id) on delete set null,
  unique (predecessor_id, successor_id),
  check (predecessor_id <> successor_id)
);

create index on public.task_dependencies (predecessor_id);
create index on public.task_dependencies (successor_id);
create index on public.task_dependencies (org_id);

alter table public.task_dependencies enable row level security;

create policy "task_dependencies_select" on public.task_dependencies
  for select using (org_id in (select public.user_org_ids()));

create policy "task_dependencies_modify" on public.task_dependencies
  for all using (org_id in (select public.user_org_ids()))
  with check (org_id in (select public.user_org_ids()));

select public.apply_standard_triggers('task_dependencies');

create trigger set_actor_audit_fields
  before insert or update on public.task_dependencies
  for each row execute function public.set_actor_audit_fields();

-- Cycle prevention: refuse INSERT/UPDATE that would create a cycle in the
-- predecessor→successor graph for a given org.
create or replace function public.task_dependency_no_cycle()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  v_cycle boolean;
begin
  -- BFS forward from new.successor_id; if we reach new.predecessor_id, the
  -- new edge closes a cycle.
  with recursive reachable as (
    select new.successor_id as node
    union
    select td.successor_id
    from public.task_dependencies td
    join reachable r on td.predecessor_id = r.node
  )
  select exists (select 1 from reachable where node = new.predecessor_id)
  into v_cycle;

  if v_cycle then
    raise exception 'task dependency would create a cycle' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger task_dependency_no_cycle
  before insert or update on public.task_dependencies
  for each row execute function public.task_dependency_no_cycle();
