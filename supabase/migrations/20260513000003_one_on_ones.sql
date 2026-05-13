-- Manager 1:1 tool.
--
-- A 1:1 is a structured meeting between a manager and one instructor focused
-- on workload review. Three tables:
--
--   one_on_ones                — the meeting itself + a denormalized capacity
--                                snapshot at the time it started.
--   one_on_one_action_items    — discrete commitments, with a category enum
--                                and an optional short description.
--   one_on_one_workload_changes — audit trail of inline edits made during
--                                the 1:1 (Phase 2 reconcile log).
--
-- Free-text fields are intentionally minimized for PHI safety. Topics and
-- concerns are enums; action items get a 140-char description with an
-- "operational items only" placeholder; rationale on workload changes is
-- category-driven, not free text. The instructor never sees their own 1:1.
--
-- Visibility: managers see all 1:1s in their org. No instructor-side view.

-- ── one_on_ones ────────────────────────────────────────────────────────────

create table public.one_on_ones (
  id                       uuid          not null default gen_random_uuid() primary key,
  org_id                   uuid          not null references public.organizations(id) on delete cascade,
  department_id            uuid          not null references public.departments(id) on delete cascade,
  instructor_id            uuid          not null references public.instructors(id) on delete cascade,
  manager_id               uuid          not null references auth.users(id) on delete set null,
  scheduled_for            timestamptz   not null default now(),
  completed_at             timestamptz,
  sentiment                text          check (sentiment in ('on_track', 'watch', 'action_needed')),
  -- topic / concern codes — validated on the app side; storing as text[] keeps
  -- the schema flexible if we add new tags later without a migration.
  topics                   text[]        not null default '{}',
  concerns                 text[]        not null default '{}',
  -- Capacity snapshot, captured when the 1:1 starts. Lets the next 1:1 show
  -- "you went from 92% → 78%" without re-running capacity math against
  -- old workload (which would have been mutated since).
  snapshot_total_hours     numeric,
  snapshot_utilization_pct numeric,
  snapshot_at              timestamptz,
  deleted_at               timestamptz,
  created_at               timestamptz   not null default now(),
  updated_at               timestamptz   not null default now(),
  created_by               uuid          references auth.users(id) on delete set null,
  updated_by               uuid          references auth.users(id) on delete set null,
  version                  integer       not null default 1
);

create index on public.one_on_ones (org_id, instructor_id, scheduled_for desc);
create index on public.one_on_ones (org_id, manager_id, scheduled_for desc);
create index on public.one_on_ones (org_id, deleted_at);

alter table public.one_on_ones enable row level security;

-- Managers see all 1:1s in their org. Instructors / viewers see nothing —
-- this tool is deliberately manager-only.
create policy "one_on_ones_select" on public.one_on_ones
  for select using (
    public.is_manager(org_id)
  );

create policy "one_on_ones_modify" on public.one_on_ones
  for all using (
    public.is_manager(org_id)
  ) with check (
    public.is_manager(org_id)
  );

select public.apply_standard_triggers('one_on_ones');

create trigger set_actor_audit_fields_one_on_ones
  before insert or update on public.one_on_ones
  for each row execute function public.set_actor_audit_fields();

create trigger bump_version_one_on_ones
  before update on public.one_on_ones
  for each row execute function public.bump_version();

-- ── one_on_one_action_items ────────────────────────────────────────────────

create table public.one_on_one_action_items (
  id                        uuid          not null default gen_random_uuid() primary key,
  one_on_one_id             uuid          not null references public.one_on_ones(id) on delete cascade,
  org_id                    uuid          not null references public.organizations(id) on delete cascade,
  department_id             uuid          not null references public.departments(id) on delete cascade,
  description               varchar(140)  not null check (length(trim(description)) > 0),
  category                  text          not null check (category in (
                                            'reduce_allocation',
                                            'add_coverage',
                                            'reassign_task',
                                            'pto_scheduling',
                                            'training_need',
                                            'project_assignment',
                                            'other_operational'
                                          )),
  owner                     text          not null check (owner in ('manager', 'instructor', 'shared')),
  due_by                    date,
  status                    text          not null default 'open' check (status in (
                                            'open', 'in_progress', 'done', 'cancelled'
                                          )),
  resolved_at               timestamptz,
  resolved_in_one_on_one_id uuid          references public.one_on_ones(id) on delete set null,
  created_at                timestamptz   not null default now(),
  updated_at                timestamptz   not null default now()
);

create index on public.one_on_one_action_items (one_on_one_id);
create index on public.one_on_one_action_items (org_id, status)
  where status in ('open', 'in_progress');

alter table public.one_on_one_action_items enable row level security;

create policy "one_on_one_action_items_all" on public.one_on_one_action_items
  for all using (
    public.is_manager(org_id)
  ) with check (
    public.is_manager(org_id)
  );

create trigger set_updated_at_one_on_one_action_items
  before update on public.one_on_one_action_items
  for each row execute function public.set_updated_at();

-- ── one_on_one_workload_changes ────────────────────────────────────────────
-- Reconcile log: every inline edit made during a 1:1 lands here so the
-- manager can review what was actually changed. before_value / after_value
-- are JSON snapshots of the touched fields (e.g., {"share_percent": 100} ↔
-- {"share_percent": 50}). rationale_category replaces free-text rationale.

create table public.one_on_one_workload_changes (
  id                  uuid          not null default gen_random_uuid() primary key,
  one_on_one_id       uuid          not null references public.one_on_ones(id) on delete cascade,
  org_id              uuid          not null references public.organizations(id) on delete cascade,
  department_id       uuid          not null references public.departments(id) on delete cascade,
  source_kind         text          not null check (source_kind in (
                                      'class_assignment',
                                      'recurring_assignment',
                                      'ad_hoc_task',
                                      'individual_allocation'
                                    )),
  source_id           uuid          not null,
  change_kind         text          not null check (change_kind in ('added', 'removed', 'modified')),
  before_value        jsonb,
  after_value         jsonb,
  rationale_category  text          check (rationale_category in (
                                      'overallocated',
                                      'underutilized',
                                      'coverage_gap',
                                      'pto_planning',
                                      'project_rebalance',
                                      'task_complete',
                                      'other_operational'
                                    )),
  created_at          timestamptz   not null default now(),
  actor_id            uuid          references auth.users(id) on delete set null
);

create index on public.one_on_one_workload_changes (one_on_one_id, created_at);

alter table public.one_on_one_workload_changes enable row level security;

create policy "one_on_one_workload_changes_all" on public.one_on_one_workload_changes
  for all using (
    public.is_manager(org_id)
  ) with check (
    public.is_manager(org_id)
  );
