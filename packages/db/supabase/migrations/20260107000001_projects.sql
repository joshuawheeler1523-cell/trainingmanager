-- ── projects ─────────────────────────────────────────────────────────────────
-- Per data_model.md §9.1. Phase 9 will ALTER this table to add the columns
-- this migration omits (e.g., public_share_token) and to introduce sibling
-- tables (project_team_members, milestones, dependencies). The columns below
-- are the minimum needed to support the TRA → project conversion in Phase 4.

create table public.projects (
  id                     uuid        not null default gen_random_uuid() primary key,
  org_id                 uuid        not null references public.organizations(id) on delete cascade,
  name                   text        not null,
  description            text,
  bucket_id              uuid        references public.allocation_buckets(id) on delete set null,
  priority               text        not null default 'medium'
                           check (priority in ('low','medium','high','critical')),
  status                 text        not null default 'planning'
                           check (status in ('planning','active','on_hold','completed','cancelled')),
  start_date             date,
  end_date               date,
  total_estimated_hours  numeric(9,2),
  source_tra_id          uuid        references public.tras(id) on delete set null,
  deleted_at             timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  created_by             uuid        references auth.users(id) on delete set null,
  updated_by             uuid        references auth.users(id) on delete set null,
  version                integer     not null default 1
);

create index on public.projects (org_id, status);
create index on public.projects (org_id, deleted_at);
create index on public.projects (bucket_id);
create index on public.projects (source_tra_id);

alter table public.projects enable row level security;

create policy "projects_select" on public.projects
  for select using (org_id in (select public.user_org_ids()));

create policy "projects_modify" on public.projects
  for all using (org_id in (select public.user_org_ids()))
  with check (org_id in (select public.user_org_ids()));

select public.apply_standard_triggers('projects');

create trigger set_actor_audit_fields
  before insert or update on public.projects
  for each row execute function public.set_actor_audit_fields();

create trigger bump_version
  before update on public.projects
  for each row execute function public.bump_version();

-- Now that projects exists, complete the FK on tras.converted_to_project_id
alter table public.tras
  add constraint tras_converted_to_project_id_fkey
  foreign key (converted_to_project_id)
  references public.projects(id)
  on delete set null;

-- ── tasks ────────────────────────────────────────────────────────────────────
-- Per data_model.md §9.3. Phase 9 will ALTER this and add task_assignments,
-- task_action_items, task_dependencies. Today we just need the rows for the
-- TRA conversion.

create table public.tasks (
  id               uuid          not null default gen_random_uuid() primary key,
  org_id           uuid          not null references public.organizations(id) on delete cascade,
  project_id       uuid          not null references public.projects(id) on delete cascade,
  name             text          not null,
  description      text,
  status           text          not null default 'not_started'
                     check (status in ('not_started','in_progress','on_hold','completed')),
  priority         text          not null default 'medium'
                     check (priority in ('low','medium','high','critical')),
  start_date       date,
  end_date         date,
  estimated_hours  numeric(7,2),
  actual_hours     numeric(7,2),
  percent_complete integer       not null default 0
                     check (percent_complete between 0 and 100),
  sort_order       integer       not null default 0,
  created_at       timestamptz   not null default now(),
  updated_at       timestamptz   not null default now(),
  created_by       uuid          references auth.users(id) on delete set null,
  updated_by       uuid          references auth.users(id) on delete set null,
  version          integer       not null default 1
);

create index on public.tasks (project_id);
create index on public.tasks (org_id, status);

alter table public.tasks enable row level security;

create policy "tasks_select" on public.tasks
  for select using (org_id in (select public.user_org_ids()));

create policy "tasks_modify" on public.tasks
  for all using (org_id in (select public.user_org_ids()))
  with check (org_id in (select public.user_org_ids()));

select public.apply_standard_triggers('tasks');

create trigger set_actor_audit_fields
  before insert or update on public.tasks
  for each row execute function public.set_actor_audit_fields();

create trigger bump_version
  before update on public.tasks
  for each row execute function public.bump_version();
