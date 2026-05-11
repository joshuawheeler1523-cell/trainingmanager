-- =============================================================================
-- Legal acceptance + cookie consent tracking
-- =============================================================================
-- Records who agreed to which version of which legal document and when.
-- Required for:
--   - SOC 2 evidence (proof of accepted ToS / Privacy / DPA)
--   - GDPR / CCPA defensibility (records cookie consent state)
--   - Dispute defense (which version of the Terms applied at signup)
--
-- Document versions are date-stamped strings (e.g. '2026-05-10') stored
-- in apps/web/src/lib/legal/versions.ts. Every revision bumps the date
-- and re-prompts users on next sign-in.
-- =============================================================================

create table public.legal_acceptances (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        references auth.users(id) on delete cascade,
  -- Some flows accept legal docs pre-signup (e.g. agency-signup form
  -- ticks ToS before the auth user even exists). We capture an email
  -- in those cases so we can match the acceptance to the user once
  -- they're created.
  email         text,
  document_key  text        not null
                            check (document_key in (
                              'terms', 'privacy', 'cookies', 'dpa', 'baa',
                              'aup', 'sla', 'reseller', 'subprocessors'
                            )),
  version       text        not null,
  ip            text,
  user_agent    text,
  context       text        not null default 'signup'
                            check (context in (
                              'signup', 'agency_signup', 'reauth', 'admin_action',
                              'cookie_banner', 'baa_request'
                            )),
  metadata      jsonb,
  accepted_at   timestamptz not null default now(),
  -- One acceptance per (user, document, version, context). Re-accepting
  -- the same version is a no-op rather than a duplicate row.
  unique nulls not distinct (user_id, email, document_key, version, context)
);

create index on public.legal_acceptances (user_id, document_key);
create index on public.legal_acceptances (lower(email), document_key);

comment on table public.legal_acceptances is
  'Versioned record of legal-document acceptances. SOC 2 evidence + dispute defense. Re-accepting the same version is idempotent via the unique constraint.';

alter table public.legal_acceptances enable row level security;

-- Users can read their own acceptances (e.g. an account-settings page
-- showing "you accepted Terms v2026-05-10 on March 5"). No write
-- policies — all writes go through server actions using the admin
-- client which bypasses RLS.
create policy legal_acceptances_select_own
  on public.legal_acceptances for select
  to authenticated
  using (user_id = auth.uid());

-- ── cookie_consents ─────────────────────────────────────────────────────────
-- Cookie consent state per user (when authenticated) or anonymous session.
-- The category flags match GDPR/CCPA categories: necessary (always on),
-- analytics, marketing.

create table public.cookie_consents (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        references auth.users(id) on delete cascade,
  session_id      text,                              -- anonymous browser id
  necessary       boolean     not null default true, -- always true; can't be disabled
  analytics       boolean     not null default false,
  marketing       boolean     not null default false,
  ip              text,
  user_agent      text,
  source          text        not null default 'banner'
                              check (source in ('banner', 'preferences', 'reset')),
  consented_at    timestamptz not null default now()
);

create index on public.cookie_consents (user_id, consented_at desc);
create index on public.cookie_consents (session_id, consented_at desc);

comment on table public.cookie_consents is
  'Append-only log of cookie consent choices. The most-recent row per (user_id) or (session_id) is the active consent. Required for GDPR/CCPA proof-of-consent.';

alter table public.cookie_consents enable row level security;

create policy cookie_consents_select_own
  on public.cookie_consents for select
  to authenticated
  using (user_id = auth.uid());

-- ── baa_requests ────────────────────────────────────────────────────────────
-- Tracks BAA workflow per client org. A hospital manager requests a BAA;
-- Arbor admin uploads the signed PDF; status transitions
-- requested → sent → signed (or → rejected).

create table public.baa_requests (
  id                  uuid        primary key default gen_random_uuid(),
  org_id              uuid        not null references public.organizations(id) on delete cascade,
  requested_by        uuid        references auth.users(id) on delete set null,
  requested_at        timestamptz not null default now(),
  status              text        not null default 'requested'
                                  check (status in ('requested', 'sent', 'signed', 'rejected', 'expired')),
  signed_pdf_path     text,                              -- Storage path once countersigned
  signer_name         text,
  signer_title        text,
  signer_email        text,
  signed_at           timestamptz,
  notes               text,
  effective_date      date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index on public.baa_requests (org_id, requested_at desc);

comment on table public.baa_requests is
  'BAA (Business Associate Agreement) workflow per client org. Hospital managers request one; Arbor admin uploads the signed PDF. Required for HIPAA-covered customers.';

alter table public.baa_requests enable row level security;

create policy baa_requests_select_manager
  on public.baa_requests for select
  to authenticated
  using (public.is_manager(org_id));

create policy baa_requests_insert_manager
  on public.baa_requests for insert
  to authenticated
  with check (public.is_manager(org_id));
