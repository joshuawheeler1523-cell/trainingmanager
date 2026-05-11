-- NOTE (2026-05-11): This migration is effectively dead code. The tables it
-- attempts to create (organization_members, audit_logs) DO NOT exist on the
-- production database — the canonical schema uses org_memberships and
-- audit_log (singular), created earlier on 20260101000003 / 20260101000004.
-- The migration is, however, recorded as applied in remote
-- supabase_migrations.schema_migrations, so we can't just delete it without
-- risking history drift.
--
-- Without the IF NOT EXISTS guards below, `supabase start` against a fresh
-- local DB blows up trying to recreate `organizations`. The guards make
-- this migration safely idempotent so local boot succeeds; on remote it
-- remains a no-op because the schema_migrations row already marks it
-- applied.

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_type where typname = 'org_role') then
    create type public.org_role as enum ('owner', 'admin', 'member');
  end if;
end$$;

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.org_role not null default 'member',
  created_at timestamptz not null default now(),
  unique(org_id, user_id)
);

create index if not exists organization_members_user_id_idx
  on public.organization_members(user_id);
create index if not exists organization_members_org_id_idx
  on public.organization_members(org_id);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  resource_type text,
  resource_id text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_org_id_created_at_idx
  on public.audit_logs(org_id, created_at desc);
create index if not exists audit_logs_actor_id_idx
  on public.audit_logs(actor_id);
