-- ── global_allocations ────────────────────────────────────────────────────────
-- Org-wide default percentage per bucket. Should sum to 100 (enforced by app
-- + a soft check in the UI; we don't enforce a sum constraint at DB level so
-- mid-edit states can be saved progressively).

create table public.global_allocations (
  id             uuid          not null default gen_random_uuid() primary key,
  org_id         uuid          not null references public.organizations(id) on delete cascade,
  bucket_id      uuid          not null references public.allocation_buckets(id) on delete cascade,
  target_percent numeric(5,2)  not null check (target_percent >= 0 and target_percent <= 100),
  created_at     timestamptz   not null default now(),
  updated_at     timestamptz   not null default now(),
  created_by     uuid          references auth.users(id) on delete set null,
  updated_by     uuid          references auth.users(id) on delete set null,
  unique (org_id, bucket_id)
);

create index on public.global_allocations (org_id);
create index on public.global_allocations (bucket_id);

alter table public.global_allocations enable row level security;

create policy "global_alloc_select" on public.global_allocations
  for select using (org_id in (select public.user_org_ids()));

create policy "global_alloc_modify" on public.global_allocations
  for all using (org_id in (select public.user_org_ids()));

select public.apply_standard_triggers('global_allocations');

create trigger set_actor_audit_fields
  before insert or update on public.global_allocations
  for each row execute function public.set_actor_audit_fields();
