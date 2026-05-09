-- =============================================================================
-- Phase 2 (Permissions overhaul) — Data migration + constraint tighten
-- =============================================================================
-- Renames legacy role values to the new three-role canonical names:
--   org_admin → manager
--   member    → instructor
--
-- Then tightens the role check constraint on org_memberships and
-- org_invitations to allow ONLY the new values:
--   manager / instructor / viewer
--
-- Finally rewrites public.is_org_admin(uuid) as a backward-compatibility
-- alias for public.is_manager(uuid) so any deployed app code that still
-- calls is_org_admin keeps working without behavior change. The alias is
-- removed in Phase 7.
--
-- Audit trail:
--   This migration writes one row to public.audit_log per renamed
--   org_memberships row and per renamed org_invitations row, with
--   operation = 'PHASE_2_ROLE_RENAME', so future auditors can answer
--   "when did Sarah become a manager?" by querying audit_log.
--
-- DOWN (rollback):
--   alter table public.org_memberships drop constraint org_memberships_role_check;
--   alter table public.org_memberships
--     add constraint org_memberships_role_check
--       check (role in ('member', 'org_admin', 'manager', 'instructor', 'viewer'));
--   alter table public.org_invitations drop constraint org_invitations_role_check;
--   alter table public.org_invitations
--     add constraint org_invitations_role_check
--       check (role in ('member', 'org_admin', 'manager', 'instructor', 'viewer'));
--   update public.org_memberships set role = 'org_admin' where role = 'manager';
--   update public.org_memberships set role = 'member'    where role = 'instructor';
--   update public.org_invitations set role = 'org_admin' where role = 'manager';
--   update public.org_invitations set role = 'member'    where role = 'instructor';
--   -- Restore the original is_org_admin definition from migration 20260101000002.
-- =============================================================================

-- ── 1. Audit pre-migration state ─────────────────────────────────────────────

insert into public.audit_log
  (org_id, actor_id, operation, table_name, record_id, changed_fields, old_values, new_values)
select
  org_id,
  null,
  'PHASE_2_ROLE_RENAME',
  'org_memberships',
  id,
  array['role'],
  jsonb_build_object('role', role),
  jsonb_build_object('role', case when role = 'org_admin' then 'manager' else 'instructor' end)
from public.org_memberships
where role in ('org_admin', 'member');

insert into public.audit_log
  (org_id, actor_id, operation, table_name, record_id, changed_fields, old_values, new_values)
select
  org_id,
  null,
  'PHASE_2_ROLE_RENAME',
  'org_invitations',
  id,
  array['role'],
  jsonb_build_object('role', role),
  jsonb_build_object('role', case when role = 'org_admin' then 'manager' else 'instructor' end)
from public.org_invitations
where role in ('org_admin', 'member');

-- ── 2. Rename role values ────────────────────────────────────────────────────

update public.org_memberships set role = 'manager'    where role = 'org_admin';
update public.org_memberships set role = 'instructor' where role = 'member';

update public.org_invitations set role = 'manager'    where role = 'org_admin';
update public.org_invitations set role = 'instructor' where role = 'member';

-- ── 3. Tighten check constraints to new values only ─────────────────────────

alter table public.org_memberships
  drop constraint org_memberships_role_check;

alter table public.org_memberships
  add constraint org_memberships_role_check
    check (role in ('manager', 'instructor', 'viewer'));

alter table public.org_invitations
  drop constraint org_invitations_role_check;

alter table public.org_invitations
  add constraint org_invitations_role_check
    check (role in ('manager', 'instructor', 'viewer'));

-- Update default role on org_memberships to 'instructor' (was 'member')
alter table public.org_memberships
  alter column role set default 'instructor';

alter table public.org_invitations
  alter column role set default 'instructor';

-- ── 4. is_org_admin → backward-compat alias for is_manager ──────────────────

create or replace function public.is_org_admin(p_org_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select public.is_manager(p_org_id);
$$;

comment on function public.is_org_admin(uuid) is
  'DEPRECATED. Backward-compat alias for public.is_manager(uuid). Removed in Phase 7. Phase 2 rename.';
