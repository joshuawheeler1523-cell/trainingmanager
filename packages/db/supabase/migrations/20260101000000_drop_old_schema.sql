-- Cleans up the v0 schema applied in the initial scaffold.
-- Drop tables first with CASCADE (removes dependent policies and triggers).
-- Uses IF EXISTS throughout so this is a no-op on a fresh database.

drop table if exists public.audit_logs cascade;
drop table if exists public.organization_members cascade;
drop table if exists public.organizations cascade;

drop function if exists public.is_org_member(uuid) cascade;
drop function if exists public.is_org_admin(uuid) cascade;

drop type if exists public.org_role cascade;
