-- =============================================================================
-- Phase 1 (Permissions overhaul) — Expand role check constraint
-- =============================================================================
-- Expands org_memberships.role and org_invitations.role to allow the new
-- three-role values (manager, instructor, viewer) IN ADDITION to the legacy
-- values (member, org_admin). No data is changed in this migration.
--
-- This permits:
--   • Phase 2 to perform the org_admin → manager / member → instructor data
--     migration without temporarily violating the constraint.
--   • Manual smoke testing of the new helpers against test rows before Phase 2.
--
-- Phase 2 will tighten the constraint back down to the new values only.
--
-- DOWN (rollback):
--   alter table public.org_invitations drop constraint org_invitations_role_check;
--   alter table public.org_invitations
--     add constraint org_invitations_role_check
--       check (role in ('member', 'org_admin'));
--   alter table public.org_memberships drop constraint org_memberships_role_check;
--   alter table public.org_memberships
--     add constraint org_memberships_role_check
--       check (role in ('member', 'org_admin'));
-- =============================================================================

alter table public.org_memberships
  drop constraint org_memberships_role_check;

alter table public.org_memberships
  add constraint org_memberships_role_check
    check (role in ('member', 'org_admin', 'manager', 'instructor', 'viewer'));

alter table public.org_invitations
  drop constraint org_invitations_role_check;

alter table public.org_invitations
  add constraint org_invitations_role_check
    check (role in ('member', 'org_admin', 'manager', 'instructor', 'viewer'));
