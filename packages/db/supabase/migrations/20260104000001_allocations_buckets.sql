-- ── allocation_buckets ────────────────────────────────────────────────────────
-- User-defined work categories (Instruction, Development, Administrative, etc.).

create table public.allocation_buckets (
  id            uuid        not null default gen_random_uuid() primary key,
  org_id        uuid        not null references public.organizations(id) on delete cascade,
  name          text        not null,
  description   text,
  color         text        not null default '#6366f1',
  display_order integer     not null default 0,
  is_archived   boolean     not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid        references auth.users(id) on delete set null,
  updated_by    uuid        references auth.users(id) on delete set null
);

-- Unique name per org for active buckets only
create unique index allocation_buckets_org_active_name_unq
  on public.allocation_buckets (org_id, name)
  where is_archived = false;

create index on public.allocation_buckets (org_id, display_order);
create index on public.allocation_buckets (org_id, is_archived);

alter table public.allocation_buckets enable row level security;

create policy "alloc_buckets_select" on public.allocation_buckets
  for select using (org_id in (select public.user_org_ids()));

create policy "alloc_buckets_modify" on public.allocation_buckets
  for all using (org_id in (select public.user_org_ids()));

select public.apply_standard_triggers('allocation_buckets');

create trigger set_actor_audit_fields
  before insert or update on public.allocation_buckets
  for each row execute function public.set_actor_audit_fields();

-- Now that allocation_buckets exists, add the deferred FK from classes
alter table public.classes
  add constraint classes_allocation_bucket_id_fkey
  foreign key (allocation_bucket_id)
  references public.allocation_buckets(id)
  on delete set null;
