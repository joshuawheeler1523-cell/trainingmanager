-- =============================================================================
-- White-Label Phase 2 — Agency-level branding
-- =============================================================================
-- Adds the per-agency branding surface used by the agency console, invoice
-- PDFs, and (eventually) custom-domain-aware login pages and outbound email.
--
-- Columns on public.agencies:
--   logo_url            text   — Supabase Storage public URL of the agency logo
--   favicon_url         text   — same, for browser favicons (Phase 3 hooks this)
--   primary_color       text   — hex (e.g. '#2563eb'); injected as --brand-primary
--   secondary_color     text   — hex; --brand-secondary
--   accent_color        text   — hex; --brand-accent
--   email_from_name     text   — "Mercy Health Training" — friendly name on outbound mail
--   email_from_address  text   — invitations@mercy-health.com — actual address (must be a
--                                  Resend-verified domain or it falls back to RESEND_FROM_EMAIL)
--
-- Color values are stored as 7-character hex (#rrggbb) — validated at the app
-- layer (server action) rather than via a DB CHECK to keep migrations forgiving
-- if we later support hsl() / rgba.
--
-- Storage bucket: `agency-branding`
--   - Public read (so logos render in <img src> on login page + invoice PDFs without auth)
--   - Path convention: {agency_id}/{filename}
--   - Insert/update/delete: agency_admin of the matching agency_id
--
-- Rollback:
--   alter table public.agencies
--     drop column logo_url, drop column favicon_url,
--     drop column primary_color, drop column secondary_color, drop column accent_color,
--     drop column email_from_name, drop column email_from_address;
--   drop policy if exists agency_branding_read on storage.objects;
--   drop policy if exists agency_branding_write on storage.objects;
--   delete from storage.buckets where id = 'agency-branding';
-- =============================================================================

alter table public.agencies
  add column logo_url           text,
  add column favicon_url        text,
  add column primary_color      text,
  add column secondary_color    text,
  add column accent_color       text,
  add column email_from_name    text,
  add column email_from_address text;

comment on column public.agencies.primary_color is
  'Hex color (#rrggbb) — injected as CSS --brand-primary in agency console + invoice PDF header. NULL = use Arbor default.';
comment on column public.agencies.email_from_address is
  'Outbound from-address. Must be a Resend-verified domain in your Resend account. NULL falls back to RESEND_FROM_EMAIL env.';

-- ── Storage bucket ─────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
  values ('agency-branding', 'agency-branding', true)
  on conflict (id) do nothing;

-- Public read on the bucket (so logos render without auth on the login page
-- and inside generated invoice PDFs).
create policy agency_branding_public_read
  on storage.objects for select
  to public
  using (bucket_id = 'agency-branding');

-- Writes require agency_admin of the matching agency_id. Path convention is
-- "{agency_id}/{filename}" — we extract the leading folder name and check
-- agency_admin status on it.
create policy agency_branding_admin_write
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'agency-branding'
    and public.is_agency_admin((storage.foldername(name))[1]::uuid)
  );

create policy agency_branding_admin_update
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'agency-branding'
    and public.is_agency_admin((storage.foldername(name))[1]::uuid)
  )
  with check (
    bucket_id = 'agency-branding'
    and public.is_agency_admin((storage.foldername(name))[1]::uuid)
  );

create policy agency_branding_admin_delete
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'agency-branding'
    and public.is_agency_admin((storage.foldername(name))[1]::uuid)
  );
