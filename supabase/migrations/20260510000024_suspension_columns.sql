-- =============================================================================
-- Arbor super-admin: tenant suspension
-- =============================================================================
-- Lets Arbor admins suspend an agency or an organization for non-payment,
-- ToS violation, etc. Suspended tenants get a polite "your account is
-- temporarily suspended" page instead of crashing or partial-loading.
--
-- Both columns are nullable; non-null means "suspended at this time."
-- A separate reason column surfaces an Arbor-admin-supplied explanation
-- on the suspension page.
-- =============================================================================

alter table public.agencies
  add column suspended_at     timestamptz,
  add column suspended_reason text;

alter table public.organizations
  add column suspended_at     timestamptz,
  add column suspended_reason text;

comment on column public.agencies.suspended_at is
  'When set, the agency console + all its client orgs are inaccessible. Cleared by Arbor admin to restore.';
comment on column public.organizations.suspended_at is
  'When set, the org and all its routes are inaccessible to its members.';
