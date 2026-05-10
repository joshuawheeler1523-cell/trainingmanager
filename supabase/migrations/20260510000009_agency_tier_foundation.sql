-- =============================================================================
-- White-Label Phase 1 — Agency tier foundation
-- =============================================================================
-- Adds the two-tier hierarchy from docs/build-plans/2026-05-09_white-label-reseller.md:
--
--   Arbor (us) → Agency (consulting firm) → Client orgs (their hospital
--                                                       customers)
--
-- New tables:
--   public.agencies              — the consulting firm
--   public.agency_memberships    — users in an agency (agency_admin / agency_member)
--
-- Schema additions to existing tables:
--   public.organizations.agency_id uuid (nullable, FK to agencies)
--     → NULL means a standalone org (every existing org defaults to this)
--
-- New SECURITY DEFINER helpers:
--   public.current_agency_id()             — caller's agency_id or NULL
--   public.has_agency_role(uuid, text[])   — boolean role check
--   public.is_agency_admin(uuid)           — convenience
--   public.is_agency_member(uuid)          — convenience
--   public.agency_org_ids(uuid)            — set of org_ids in an agency
--
-- RLS pattern:
--   agencies / agency_memberships  → visible to fellow agency members;
--                                    only agency_admin can mutate.
--   organizations                  → existing org-member SELECT preserved;
--                                    agency_admin can additionally SELECT
--                                    + UPDATE org rows for orgs in their
--                                    agency (for renames + transfers + the
--                                    agency-level branding rollups in
--                                    Phase 2). Tenant data inside those orgs
--                                    is STILL gated by manager/instructor/
--                                    viewer membership in that specific org —
--                                    agency_admin is NOT auto-promoted.
--
-- DOWN (rollback):
--   alter table public.organizations drop column agency_id;
--   drop function if exists public.agency_org_ids(uuid);
--   drop function if exists public.is_agency_member(uuid);
--   drop function if exists public.is_agency_admin(uuid);
--   drop function if exists public.has_agency_role(uuid, text[]);
--   drop function if exists public.current_agency_id();
--   drop table if exists public.agency_memberships;
--   drop table if exists public.agencies;
-- =============================================================================

-- ── 1. agencies table ──────────────────────────────────────────────────────

create table public.agencies (
  id           uuid        primary key default gen_random_uuid(),
  slug         citext      not null unique,
  name         text        not null,
  -- Branding columns (logo_url, primary_color, etc.) are added in Phase 2.
  -- Custom domain + cert columns are added in Phase 3.
  -- Stripe + revenue share columns are added in Phase 5.
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid        references auth.users(id) on delete set null,
  updated_by   uuid        references auth.users(id) on delete set null,
  version      integer     not null default 1
);

comment on table public.agencies is
  'White-label consulting firms. Each agency owns 0+ client organizations. NULL agency_id on organizations means standalone (no agency).';

-- ── 2. agency_memberships table ────────────────────────────────────────────

create table public.agency_memberships (
  id           uuid        primary key default gen_random_uuid(),
  agency_id    uuid        not null references public.agencies(id) on delete cascade,
  user_id      uuid        not null references auth.users(id) on delete cascade,
  role         text        not null default 'agency_member'
                           check (role in ('agency_admin', 'agency_member')),
  invited_at   timestamptz,
  accepted_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (agency_id, user_id)
);

create index on public.agency_memberships (user_id);
create index on public.agency_memberships (agency_id);

comment on column public.agency_memberships.role is
  'agency_admin: manage agency settings, billing, branding, custom domain, create/manage client orgs. agency_member: read-only on agency dashboard (rollup analytics, billing snapshot).';

-- ── 3. organizations.agency_id FK ──────────────────────────────────────────

alter table public.organizations
  add column agency_id uuid references public.agencies(id) on delete set null;

create index on public.organizations (agency_id);

comment on column public.organizations.agency_id is
  'NULL for standalone orgs (default for all existing orgs). Set when an agency provisions a client org. ON DELETE SET NULL: deleting an agency orphans its orgs (they become standalone) rather than cascade-deleting tenant data.';

-- ── 4. SECURITY DEFINER helpers ────────────────────────────────────────────

-- Returns the caller's agency_id, or NULL if not a member of any agency.
-- For users who happen to be in multiple agencies (rare; not common in v1),
-- returns the most-recently-accepted membership.
create or replace function public.current_agency_id()
  returns uuid
  language plpgsql stable security definer
  set search_path = ''
as $$
declare
  v_agency_id uuid;
begin
  select agency_id
    into v_agency_id
    from public.agency_memberships
    where user_id      = auth.uid()
      and accepted_at  is not null
    order by accepted_at desc
    limit 1;
  return v_agency_id;
end;
$$;

-- True if the caller has an accepted membership in p_agency_id with role in
-- p_roles. All single-role helpers below delegate to this for consistency.
create or replace function public.has_agency_role(p_agency_id uuid, p_roles text[])
  returns boolean
  language plpgsql stable security definer
  set search_path = ''
as $$
begin
  return exists (
    select 1
    from public.agency_memberships
    where agency_id    = p_agency_id
      and user_id      = auth.uid()
      and accepted_at  is not null
      and role         = any(p_roles)
  );
end;
$$;

create or replace function public.is_agency_admin(p_agency_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select public.has_agency_role(p_agency_id, array['agency_admin']);
$$;

create or replace function public.is_agency_member(p_agency_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select public.has_agency_role(p_agency_id, array['agency_admin','agency_member']);
$$;

-- Pure lookup: returns every org_id belonging to the given agency. The
-- caller's permission to USE this is enforced separately by RLS on the
-- consuming query.
create or replace function public.agency_org_ids(p_agency_id uuid)
  returns setof uuid
  language sql stable security definer
  set search_path = ''
as $$
  select id from public.organizations where agency_id = p_agency_id;
$$;

comment on function public.current_agency_id() is
  'Returns caller''s agency_id, or NULL if not in an agency. Phase 1 white-label.';
comment on function public.has_agency_role(uuid, text[]) is
  'True if caller is an accepted member of the agency with role in the given set.';
comment on function public.is_agency_admin(uuid) is
  'True if caller is an agency_admin in the given agency.';
comment on function public.is_agency_member(uuid) is
  'True if caller is any kind of accepted member of the given agency (admin or member).';
comment on function public.agency_org_ids(uuid) is
  'Set of org_ids belonging to the given agency. Pure lookup; caller permission enforced by query-level RLS.';

-- ── 5. RLS on agencies ─────────────────────────────────────────────────────

alter table public.agencies enable row level security;

create policy agencies_select_member ON public.agencies for select
  using (public.is_agency_member(id));

create policy agencies_modify_admin ON public.agencies for all
  using (public.is_agency_admin(id))
  with check (public.is_agency_admin(id));

create trigger set_updated_at
  before update on public.agencies
  for each row execute function public.set_updated_at();

create trigger set_actor_audit_fields
  before insert or update on public.agencies
  for each row execute function public.set_actor_audit_fields();

create trigger bump_version
  before update on public.agencies
  for each row execute function public.bump_version();

-- ── 6. RLS on agency_memberships ───────────────────────────────────────────

alter table public.agency_memberships enable row level security;

create policy agency_memberships_select ON public.agency_memberships for select
  using (public.is_agency_member(agency_id));

create policy agency_memberships_insert_admin ON public.agency_memberships for insert
  with check (public.is_agency_admin(agency_id));

create policy agency_memberships_update_admin ON public.agency_memberships for update
  using (public.is_agency_admin(agency_id))
  with check (public.is_agency_admin(agency_id));

create policy agency_memberships_delete_admin ON public.agency_memberships for delete
  using (public.is_agency_admin(agency_id));

create trigger set_updated_at
  before update on public.agency_memberships
  for each row execute function public.set_updated_at();

-- ── 7. organizations RLS — additive: agency_admin can SELECT + UPDATE ────
-- Existing "members can view their org" + "org admins can update their org"
-- policies stay. We layer on two NEW policies for agency context.
--
-- This lets an agency_admin see + rename + (later) re-brand orgs they own
-- WITHOUT auto-granting access to the tenant data inside those orgs. Tenant
-- data still requires a manager/instructor/viewer org_membership.

create policy organizations_select_agency_admin ON public.organizations for select
  using (
    agency_id is not null
    and public.is_agency_admin(agency_id)
  );

create policy organizations_update_agency_admin ON public.organizations for update
  using (
    agency_id is not null
    and public.is_agency_admin(agency_id)
  )
  with check (
    agency_id is not null
    and public.is_agency_admin(agency_id)
  );
