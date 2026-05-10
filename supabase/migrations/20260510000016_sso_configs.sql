-- =============================================================================
-- White-Label Phase 4 — SSO per client org (SAML)
-- =============================================================================
-- Each org can register one SAML 2.0 SSO config keyed by email domain. When
-- a user enters an email matching the configured domain on /login, we
-- redirect them to the IdP via Supabase's signInWithSSO instead of asking
-- for a password / sending a magic link.
--
-- The actual SAML handshake + just-in-time provisioning is handled by
-- Supabase Auth (sso.sso_providers in the auth schema). This table is the
-- bridge between {org, email_domain} and the auth-side provider id.
--
-- Why one config per org (not per agency): hospital IT teams own their own
-- IdPs (AzureAD, Okta, Google Workspace). An agency that resells to 5
-- hospitals will have 5 different SAML configs. Per-agency wouldn't work.
--
-- Rollback:
--   drop table public.sso_configs;
-- =============================================================================

create table public.sso_configs (
  id                    uuid        primary key default gen_random_uuid(),
  org_id                uuid        not null references public.organizations(id) on delete cascade,
  email_domain          citext      not null,
  -- Supabase auth.sso_providers id (stored as text since auth schema is opaque)
  supabase_provider_id  text,
  display_name          text,        -- "AzureAD - Mercy Health"
  enabled               boolean     not null default false,
  created_at            timestamptz not null default now(),
  created_by            uuid        references auth.users(id) on delete set null,
  updated_at            timestamptz not null default now(),
  -- One config per (org, domain). Lookups go through the email_domain unique
  -- index since SSO discovery happens BEFORE the user has authenticated.
  unique (org_id, email_domain)
);

-- Email-domain → org lookup must be globally unique: an email at @mercy.com
-- can only belong to one SSO config across all of Arbor. The pre-auth login
-- flow can't disambiguate by org context.
create unique index sso_configs_email_domain_unique
  on public.sso_configs (email_domain)
  where enabled is true;

create index on public.sso_configs (org_id);

comment on table public.sso_configs is
  'Per-org SAML SSO configuration. Pre-auth lookups by email_domain decide whether to send the user to their IdP or fall through to password/magic-link.';

alter table public.sso_configs enable row level security;

-- Managers see + manage their org's SSO config
create policy sso_configs_select_manager
  on public.sso_configs for select
  to authenticated
  using (public.is_manager(org_id));

create policy sso_configs_insert_manager
  on public.sso_configs for insert
  to authenticated
  with check (public.is_manager(org_id));

create policy sso_configs_update_manager
  on public.sso_configs for update
  to authenticated
  using (public.is_manager(org_id))
  with check (public.is_manager(org_id));

create policy sso_configs_delete_manager
  on public.sso_configs for delete
  to authenticated
  using (public.is_manager(org_id));

-- ── Pre-auth lookup RPC ────────────────────────────────────────────────────
-- Login page needs to know "is there an SSO config for this email's domain?"
-- before the user has signed in. SECURITY DEFINER function returns only
-- (provider_id, display_name) — leaks no PII; revealing that an email
-- domain has SSO is no different from any DNS lookup.

create or replace function public.lookup_sso_for_email_domain(p_domain text)
  returns table (
    provider_id  text,
    display_name text
  )
  language sql stable security definer
  set search_path = ''
as $$
  select s.supabase_provider_id, s.display_name
    from public.sso_configs s
    where lower(s.email_domain::text) = lower(p_domain)
      and s.enabled is true
      and s.supabase_provider_id is not null
    limit 1;
$$;

grant execute on function public.lookup_sso_for_email_domain(text) to anon, authenticated;
