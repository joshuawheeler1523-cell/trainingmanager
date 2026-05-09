-- ── feature_flags ─────────────────────────────────────────────────────────────
-- org_id = NULL means the flag is global (visible to all authenticated users).

create table public.feature_flags (
  id         uuid        primary key default gen_random_uuid(),
  org_id     uuid        references public.organizations(id) on delete cascade,
  key        text        not null,
  enabled    boolean     not null default false,
  value      jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, key)
);

create index on public.feature_flags (org_id, key);
create index on public.feature_flags (key) where org_id is null;

alter table public.feature_flags enable row level security;

create policy "authenticated users can read global flags"
  on public.feature_flags for select
  using (
    org_id is null
    or org_id in (select public.user_org_ids())
  );

create policy "org admins can manage org flags"
  on public.feature_flags for all
  using (public.is_org_admin(org_id))
  with check (public.is_org_admin(org_id));

create trigger set_updated_at
  before update on public.feature_flags
  for each row execute function public.set_updated_at();
