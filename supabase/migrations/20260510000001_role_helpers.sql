-- =============================================================================
-- Phase 1 (Permissions overhaul) — Role helper functions
-- =============================================================================
-- Adds the helper functions that future RLS policies and app server actions
-- will use to check the three-role model: manager / instructor / viewer.
--
-- This migration is purely additive. It does NOT change existing policies,
-- existing app behavior, or existing role values. The legacy is_org_admin()
-- helper continues to work unchanged. Phase 2 migrates data and renames.
--
-- Helpers (all SECURITY DEFINER, search_path locked to '' for safety):
--   user_role_in_org(p_org_id uuid)        returns text
--   has_any_role(p_org_id uuid, text[])    returns boolean
--   is_manager(p_org_id uuid)              returns boolean
--   is_instructor(p_org_id uuid)           returns boolean
--   is_viewer(p_org_id uuid)               returns boolean
--   current_instructor_id(p_org_id uuid)   returns uuid
--
-- DOWN (rollback):
--   drop function if exists public.current_instructor_id(uuid);
--   drop function if exists public.is_viewer(uuid);
--   drop function if exists public.is_instructor(uuid);
--   drop function if exists public.is_manager(uuid);
--   drop function if exists public.has_any_role(uuid, text[]);
--   drop function if exists public.user_role_in_org(uuid);
-- =============================================================================

-- Returns the caller's role in p_org_id, or NULL if not an accepted member.
create or replace function public.user_role_in_org(p_org_id uuid)
  returns text
  language plpgsql stable security definer
  set search_path = ''
as $$
declare
  v_role text;
begin
  select role
    into v_role
    from public.org_memberships
    where org_id      = p_org_id
      and user_id     = auth.uid()
      and accepted_at is not null
    limit 1;
  return v_role;
end;
$$;

-- True if the caller is an accepted member of p_org_id with role in p_roles.
-- All single-role helpers below delegate to this for consistency.
create or replace function public.has_any_role(p_org_id uuid, p_roles text[])
  returns boolean
  language plpgsql stable security definer
  set search_path = ''
as $$
begin
  return exists (
    select 1
    from public.org_memberships
    where org_id      = p_org_id
      and user_id     = auth.uid()
      and accepted_at is not null
      and role        = any(p_roles)
  );
end;
$$;

create or replace function public.is_manager(p_org_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select public.has_any_role(p_org_id, array['manager']);
$$;

create or replace function public.is_instructor(p_org_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select public.has_any_role(p_org_id, array['instructor']);
$$;

create or replace function public.is_viewer(p_org_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select public.has_any_role(p_org_id, array['viewer']);
$$;

-- Resolves the caller's instructors.id row in p_org_id via instructors.user_id.
-- Returns NULL if no link exists (orphan instructor user — read-only experience
-- until a manager attaches them to an instructor row).
-- This is the scope key for instructor-tier RLS policies in Phase 4.
create or replace function public.current_instructor_id(p_org_id uuid)
  returns uuid
  language plpgsql stable security definer
  set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id
    into v_id
    from public.instructors
    where org_id  = p_org_id
      and user_id = auth.uid()
    limit 1;
  return v_id;
end;
$$;

comment on function public.user_role_in_org(uuid) is
  'Returns caller''s role in the given org, or NULL if not an accepted member. Phase 1 of three-role permissions.';
comment on function public.has_any_role(uuid, text[]) is
  'True if caller is an accepted member of the org with role in the given set. Phase 1 of three-role permissions.';
comment on function public.is_manager(uuid) is
  'True if caller is a manager in the given org. Phase 1; replaces is_org_admin() after Phase 2 data migration.';
comment on function public.is_instructor(uuid) is
  'True if caller is an instructor in the given org. Phase 1.';
comment on function public.is_viewer(uuid) is
  'True if caller is a viewer in the given org. Phase 1.';
comment on function public.current_instructor_id(uuid) is
  'Resolves caller''s instructors.id row in the given org via instructors.user_id. NULL if no link. Scope key for instructor-tier RLS in Phase 4.';
