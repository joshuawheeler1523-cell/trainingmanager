-- ── allocation_groups ────────────────────────────────────────────────────────
-- Groups of instructors (e.g., "Clinical Instructors", "Senior Developers").

create table public.allocation_groups (
  id          uuid        not null default gen_random_uuid() primary key,
  org_id      uuid        not null references public.organizations(id) on delete cascade,
  name        text        not null,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid        references auth.users(id) on delete set null,
  updated_by  uuid        references auth.users(id) on delete set null,
  unique (org_id, name)
);

create index on public.allocation_groups (org_id);

alter table public.allocation_groups enable row level security;

create policy "alloc_groups_select" on public.allocation_groups
  for select using (org_id in (select public.user_org_ids()));

create policy "alloc_groups_modify" on public.allocation_groups
  for all using (org_id in (select public.user_org_ids()));

select public.apply_standard_triggers('allocation_groups');

create trigger set_actor_audit_fields
  before insert or update on public.allocation_groups
  for each row execute function public.set_actor_audit_fields();

-- ── allocation_group_members ─────────────────────────────────────────────────

create table public.allocation_group_members (
  group_id      uuid        not null references public.allocation_groups(id) on delete cascade,
  instructor_id uuid        not null references public.instructors(id) on delete cascade,
  org_id        uuid        not null references public.organizations(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (group_id, instructor_id)
);

create index on public.allocation_group_members (instructor_id);
create index on public.allocation_group_members (org_id);

alter table public.allocation_group_members enable row level security;

create policy "alloc_group_members_select" on public.allocation_group_members
  for select using (org_id in (select public.user_org_ids()));

create policy "alloc_group_members_modify" on public.allocation_group_members
  for all using (org_id in (select public.user_org_ids()));

-- audit only (no updated_at column on this junction table)
create trigger write_audit_log
  after insert or update or delete on public.allocation_group_members
  for each row execute function public.write_audit_log();

-- ── group_allocations ─────────────────────────────────────────────────────────
-- Per-group bucket percentages (override global for members of that group).

create table public.group_allocations (
  id             uuid          not null default gen_random_uuid() primary key,
  org_id         uuid          not null references public.organizations(id) on delete cascade,
  group_id       uuid          not null references public.allocation_groups(id) on delete cascade,
  bucket_id      uuid          not null references public.allocation_buckets(id) on delete cascade,
  target_percent numeric(5,2)  not null check (target_percent >= 0 and target_percent <= 100),
  created_at     timestamptz   not null default now(),
  updated_at     timestamptz   not null default now(),
  created_by     uuid          references auth.users(id) on delete set null,
  updated_by     uuid          references auth.users(id) on delete set null,
  unique (group_id, bucket_id)
);

create index on public.group_allocations (org_id);
create index on public.group_allocations (group_id);
create index on public.group_allocations (bucket_id);

alter table public.group_allocations enable row level security;

create policy "group_alloc_select" on public.group_allocations
  for select using (org_id in (select public.user_org_ids()));

create policy "group_alloc_modify" on public.group_allocations
  for all using (org_id in (select public.user_org_ids()));

select public.apply_standard_triggers('group_allocations');

create trigger set_actor_audit_fields
  before insert or update on public.group_allocations
  for each row execute function public.set_actor_audit_fields();
