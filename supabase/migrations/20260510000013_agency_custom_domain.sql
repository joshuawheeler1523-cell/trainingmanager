-- =============================================================================
-- White-Label Phase 3 — Custom domains (BYOD)
-- =============================================================================
-- Adds the per-agency custom-domain surface so agencies can serve Arbor under
-- their own hostname (e.g. app.consulting-firm.com). Domain ownership is
-- proven via DNS verification handled by the Vercel Domains API (CNAME or A
-- record), then a TXT record for ownership. Cert provisioning is automatic.
--
-- Columns on public.agencies:
--   custom_domain                    citext, unique  — verified hostname (lowercased)
--   custom_domain_pending            citext          — domain awaiting DNS verify
--   custom_domain_verification_token text           — TXT record value Vercel issues
--   custom_domain_verified_at        timestamptz    — flipped non-null when Vercel reports
--                                                      configured = true; checked by middleware
--                                                      to enforce verified-only routing
--
-- Why two domain columns? While verification is in flight we don't want the
-- middleware to start routing requests for an unverified domain (would show
-- the wrong agency's brand or leak data). custom_domain_pending holds the
-- candidate; custom_domain only ever holds verified hostnames.
--
-- Rollback:
--   alter table public.agencies
--     drop column custom_domain,
--     drop column custom_domain_pending,
--     drop column custom_domain_verification_token,
--     drop column custom_domain_verified_at;
-- =============================================================================

alter table public.agencies
  add column custom_domain                    citext,
  add column custom_domain_pending            citext,
  add column custom_domain_verification_token text,
  add column custom_domain_verified_at        timestamptz;

-- Unique only on the verified column so multiple agencies can have the same
-- pending value briefly without conflict (the API prevents this at the app
-- layer; the constraint just enforces verified-uniqueness).
create unique index agencies_custom_domain_unique
  on public.agencies (custom_domain)
  where custom_domain is not null;

comment on column public.agencies.custom_domain is
  'Verified custom hostname (citext). Middleware reads the request Host header and looks up the agency here to scope branding + login.';
comment on column public.agencies.custom_domain_pending is
  'Domain awaiting DNS verification. Surfaces in /agency/domain alongside the TXT record value the user must set. Promoted to custom_domain when Vercel reports configured = true.';
