-- =============================================================================
-- Agency admins get manager access to their client orgs WITHOUT an org_membership
-- =============================================================================
-- Previously, provisioning a client org auto-inserted the calling agency_admin
-- as an accepted `manager` org_membership (and a department_membership) so they
-- could operate inside the org. That made agency staff count as a hospital
-- "user": inflated seat counts (billing defines an active user as a non-revoked
-- org_membership), polluted the org's team roster, and produced a phantom member
-- that falsely completed the dashboard "Invite your team" setup step.
--
-- New model: agency admins are NOT org members. Their manager-equivalent access
-- to every org under their agency is resolved centrally in the three role
-- helpers below, so it cascades to all RLS policies AND every app-side role
-- check (getCurrentRole / isManager / requireRole) with no per-table changes.
--
-- DOWN (rollback):
--   Recreate user_org_ids / has_any_role / user_role_in_org from
--   20260510000001_role_helpers.sql + 20260510000009 (their pre-agency bodies),
--   and drop is_agency_admin_of_org. The backfill DELETEs are NOT reversible.
-- =============================================================================

-- ── 1. Helper: is the caller an accepted agency_admin of p_org_id's agency? ──
create or replace function public.is_agency_admin_of_org(p_org_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select exists (
    select 1
    from public.organizations o
    join public.agency_memberships am on am.agency_id = o.agency_id
    where o.id          = p_org_id
      and am.user_id    = auth.uid()
      and am.accepted_at is not null
      and am.role       = 'agency_admin'
  );
$$;

revoke execute on function public.is_agency_admin_of_org(uuid) from public;
grant execute on function public.is_agency_admin_of_org(uuid) to authenticated, anon, service_role;

-- ── 2. user_org_ids(): union in client orgs the caller administers ──────────
-- Drives every SELECT policy (org_id IN user_org_ids()).
create or replace function public.user_org_ids()
  returns setof uuid
  language sql stable security definer
  set search_path = ''
as $$
  select org_id
  from public.org_memberships
  where user_id = auth.uid()
    and accepted_at is not null
  union
  select o.id
  from public.organizations o
  join public.agency_memberships am on am.agency_id = o.agency_id
  where am.user_id     = auth.uid()
    and am.accepted_at is not null
    and am.role        = 'agency_admin';
$$;

-- ── 3. has_any_role(): an agency admin counts as 'manager' ──────────────────
-- Drives is_manager() and therefore every write-tier RLS policy.
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
  )
  or ('manager' = any(p_roles) and public.is_agency_admin_of_org(p_org_id));
end;
$$;

-- ── 4. user_role_in_org(): direct role wins; else agency admin → 'manager' ──
-- Drives app role checks (getCurrentRole / requireRole) and org-context resolution.
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
  if v_role is not null then
    return v_role;
  end if;
  if public.is_agency_admin_of_org(p_org_id) then
    return 'manager';
  end if;
  return null;
end;
$$;

-- ── 5. Backfill: drop the phantom agency-admin memberships ──────────────────
-- Manager access now flows from the helpers above, so removing these rows costs
-- the agency admin no access — it just stops counting agency staff as hospital
-- members (seats / roster / setup checklist). Only touches agency-managed orgs.
delete from public.department_memberships dm
using public.departments d, public.organizations o, public.agency_memberships am
where dm.department_id = d.id
  and d.org_id         = o.id
  and o.agency_id      is not null
  and am.agency_id     = o.agency_id
  and am.user_id       = dm.user_id
  and am.accepted_at   is not null
  and am.role          = 'agency_admin';

delete from public.org_memberships m
using public.organizations o, public.agency_memberships am
where m.org_id       = o.id
  and o.agency_id    is not null
  and am.agency_id   = o.agency_id
  and am.user_id     = m.user_id
  and am.accepted_at is not null
  and am.role        = 'agency_admin';

comment on function public.is_agency_admin_of_org(uuid) is
  'True if caller is an accepted agency_admin of the agency owning the given org. Grants manager-equivalent access to client orgs without an org_membership.';
