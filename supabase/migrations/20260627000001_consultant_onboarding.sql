-- Consultant onboarding — a checklist matrix for onboarding external/consultant
-- trainers (the "principal trainers" assigned in the Training Planner).
--
-- Replaces a hand-maintained spreadsheet: rows are the org's external
-- instructors (instructors.is_external = true), columns are a shared, ordered
-- checklist of onboarding tasks, and each cell records a status + completion
-- date + free-text notes. Onboarding is tracked once per consultant at the org
-- level (not per implementation) — a consultant onboards when they join the
-- bench, regardless of which project picks them up later.
--
-- Manager-scoped: this is an admin tool, so both tables are visible/editable
-- only to org managers (is_manager(org_id)). No department dimension — the
-- external pool is org-wide.

-- ── onboarding_tasks: the shared checklist (grid columns) ────────────────────

create table public.onboarding_tasks (
  id          uuid          not null default gen_random_uuid() primary key,
  org_id      uuid          not null references public.organizations(id) on delete cascade,
  name        text          not null check (length(trim(name)) > 0),
  description text,
  sort_order  integer       not null default 0,
  deleted_at  timestamptz,
  created_at  timestamptz   not null default now(),
  updated_at  timestamptz   not null default now(),
  created_by  uuid          references auth.users(id) on delete set null,
  updated_by  uuid          references auth.users(id) on delete set null,
  version     integer       not null default 1
);

create index on public.onboarding_tasks (org_id, sort_order) where deleted_at is null;
create index on public.onboarding_tasks (org_id, lower(name));

alter table public.onboarding_tasks enable row level security;

create policy "onboarding_tasks_select" on public.onboarding_tasks
  for select using (
    org_id in (select public.user_org_ids())
    and public.is_manager(org_id)
  );

create policy "onboarding_tasks_modify" on public.onboarding_tasks
  for all using (
    org_id in (select public.user_org_ids())
    and public.is_manager(org_id)
  ) with check (
    org_id in (select public.user_org_ids())
    and public.is_manager(org_id)
  );

select public.apply_standard_triggers('onboarding_tasks');

create trigger set_actor_audit_fields
  before insert or update on public.onboarding_tasks
  for each row execute function public.set_actor_audit_fields();

create trigger bump_version
  before update on public.onboarding_tasks
  for each row execute function public.bump_version();

-- ── onboarding_progress: one row per consultant × task (grid cells) ──────────
--
-- Sparse: a missing row means "not started". The app upserts on edit, keyed by
-- (instructor_id, task_id). instructor_id references the external-pool
-- instructor; task_id references the checklist column. Both cascade so deleting
-- a task column or removing a consultant cleans up their cells.

create table public.onboarding_progress (
  id            uuid          not null default gen_random_uuid() primary key,
  org_id        uuid          not null references public.organizations(id) on delete cascade,
  instructor_id uuid          not null references public.instructors(id) on delete cascade,
  task_id       uuid          not null references public.onboarding_tasks(id) on delete cascade,
  status        text          not null default 'not_started'
                  check (status in ('not_started', 'in_progress', 'done')),
  completed_at  date,
  notes         text,
  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now(),
  created_by    uuid          references auth.users(id) on delete set null,
  updated_by    uuid          references auth.users(id) on delete set null,
  version       integer       not null default 1,
  unique (instructor_id, task_id)
);

create index on public.onboarding_progress (org_id, instructor_id);
create index on public.onboarding_progress (org_id, task_id);

alter table public.onboarding_progress enable row level security;

create policy "onboarding_progress_select" on public.onboarding_progress
  for select using (
    org_id in (select public.user_org_ids())
    and public.is_manager(org_id)
  );

create policy "onboarding_progress_modify" on public.onboarding_progress
  for all using (
    org_id in (select public.user_org_ids())
    and public.is_manager(org_id)
  ) with check (
    org_id in (select public.user_org_ids())
    and public.is_manager(org_id)
  );

select public.apply_standard_triggers('onboarding_progress');

create trigger set_actor_audit_fields
  before insert or update on public.onboarding_progress
  for each row execute function public.set_actor_audit_fields();

create trigger bump_version
  before update on public.onboarding_progress
  for each row execute function public.bump_version();
