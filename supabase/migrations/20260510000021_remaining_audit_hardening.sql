-- =============================================================================
-- Remaining audit hardening — signup throttle, domain TTL, export sweeper, MIME
-- =============================================================================
-- Closes the last 4 actionable findings from the post-build audit:
--   1. agency_signup_attempts — DB-backed rate limit (no Upstash dependency)
--   2. agencies.custom_domain_pending TTL — auto-expire stale claims so a
--      squat doesn't permanently block a legit owner
--   3. data-exports cleanup function — keeps the bucket from accumulating
--      ZIPs forever; pairs with a manager-scoped DELETE policy on the bucket
--   4. agency-branding bucket MIME allowlist — eliminate latent SVG/HTML
--      XSS surface
-- =============================================================================

-- ── 1. signup throttle ────────────────────────────────────────────────────

create table public.agency_signup_attempts (
  id              uuid        primary key default gen_random_uuid(),
  ip              text,                              -- nullable (we may not always know it)
  email           text        not null,
  agency_slug     text        not null,
  succeeded       boolean     not null default false,
  created_at      timestamptz not null default now()
);

create index on public.agency_signup_attempts (ip, created_at desc);
create index on public.agency_signup_attempts (lower(email), created_at desc);

comment on table public.agency_signup_attempts is
  'Append-only log of agency-signup attempts. Used by createAgencySignupAction to throttle (3/hr per IP, 3/day per email). RLS denies all client reads — service-role only.';

alter table public.agency_signup_attempts enable row level security;
-- No policies = default deny for client roles. Service role bypasses RLS.

-- ── 2. domain pending TTL ──────────────────────────────────────────────────

alter table public.agencies
  add column custom_domain_pending_at timestamptz;

comment on column public.agencies.custom_domain_pending_at is
  'Timestamp when custom_domain_pending was set. Used to auto-expire stale claims (default 24h via expire_stale_pending_domains).';

create or replace function public.expire_stale_pending_domains(
  p_max_age_hours integer default 24
)
  returns table (agency_id uuid, expired_domain text)
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_cutoff timestamptz;
  v_row record;
begin
  v_cutoff := now() - (p_max_age_hours || ' hours')::interval;
  for v_row in
    select id, custom_domain_pending
      from public.agencies
      where custom_domain_pending is not null
        and custom_domain_pending_at is not null
        and custom_domain_pending_at < v_cutoff
  loop
    update public.agencies
      set custom_domain_pending = null,
          custom_domain_pending_at = null,
          custom_domain_verification_token = null
      where id = v_row.id;
    agency_id := v_row.id;
    expired_domain := v_row.custom_domain_pending::text;
    return next;
  end loop;
  return;
end;
$$;

revoke execute on function public.expire_stale_pending_domains(integer)
  from public, anon, authenticated;
grant execute on function public.expire_stale_pending_domains(integer)
  to service_role;

comment on function public.expire_stale_pending_domains(integer) is
  'Clears custom_domain_pending rows older than N hours (default 24). Wire to monthly cron alongside invoice generator + audit retention.';

-- ── 3. data-exports cleanup + DELETE policy ───────────────────────────────

create or replace function public.purge_old_data_exports(
  p_max_age_days integer default 30
)
  returns table (export_id uuid, org_id uuid, storage_path text)
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_cutoff timestamptz;
  v_row record;
begin
  v_cutoff := now() - (p_max_age_days || ' days')::interval;
  for v_row in
    select id, org_id, storage_path
      from public.data_exports
      where created_at < v_cutoff
        and storage_path is not null
  loop
    -- The actual ZIP delete happens in app code (Supabase Storage admin
    -- API); this function returns the candidate paths for the caller to
    -- remove. We DON'T delete the data_exports row — the audit trail
    -- (who exported, when, how big) stays for compliance even after the
    -- file itself is gone.
    update public.data_exports
      set storage_path = null
      where id = v_row.id;
    export_id := v_row.id;
    org_id := v_row.org_id;
    storage_path := v_row.storage_path;
    return next;
  end loop;
  return;
end;
$$;

revoke execute on function public.purge_old_data_exports(integer)
  from public, anon, authenticated;
grant execute on function public.purge_old_data_exports(integer)
  to service_role;

comment on function public.purge_old_data_exports(integer) is
  'Returns the storage paths of expired exports + nulls out storage_path on the data_exports row. Caller (cron task) is responsible for the actual blob deletion. Audit row is preserved.';

-- Manager-scoped DELETE policy so a manual cleanup from the UI is also
-- possible (today no UI; future-proof + completes the policy set).
create policy data_exports_manager_delete
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'data-exports'
    and public.is_manager((storage.foldername(name))[1]::uuid)
  );

-- ── 4. agency-branding MIME allowlist ─────────────────────────────────────
-- Restrict the public-read bucket to image MIME types we actually render
-- via &lt;img&gt;. SVG is intentionally excluded because SVGs can carry
-- inline JavaScript, which becomes XSS the moment any code path renders
-- one via &lt;object&gt; / &lt;iframe&gt; / direct navigation.

update storage.buckets
  set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
      file_size_limit = 2097152  -- 2 MiB matches the client-side check
  where id = 'agency-branding';
