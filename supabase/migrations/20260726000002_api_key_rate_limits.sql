-- =============================================================================
-- Rate limiting + unique key prefixes for the public /api/v1 REST surface.
-- =============================================================================
-- Two problems this fixes:
--
-- 1. Verification cost scaled with tenant count. The stored key_prefix was 12
--    chars — "arbor_live_" is 11, so it captured a single character of the
--    secret. Every bearer token therefore selected roughly 1/64 of ALL keys on
--    the platform, and each candidate cost a bcrypt compare (~100ms at cost 10).
--    An unauthenticated caller sending garbage tokens could burn arbitrary CPU.
--    Widening the prefix to 23 chars (11 + 12 secret chars) and making it
--    UNIQUE means a token selects at most one row, so an invalid token costs
--    one indexed lookup and zero bcrypt work.
--
-- 2. There was no request throttle of any kind on /api/v1.
--
-- Safe to apply without backfill: no API keys have ever been issued
-- (select count(*) from api_keys = 0), so there are no legacy 12-char prefixes.
-- =============================================================================

create unique index if not exists api_keys_key_prefix_key
  on public.api_keys (key_prefix);

comment on column public.api_keys.key_prefix is
  'First 23 chars of the key ("arbor_<env>_" + 12 secret chars). UNIQUE so verification selects exactly one row and an invalid token costs zero bcrypt compares.';

-- ── Fixed-window request counters ────────────────────────────────────────────

create table if not exists public.api_rate_limits (
  api_key_id    uuid        not null references public.api_keys(id) on delete cascade,
  window_start  timestamptz not null,
  request_count integer     not null default 0,
  primary key (api_key_id, window_start)
);

-- Counters are written only by the SECURITY DEFINER function below (which
-- bypasses RLS). RLS on with no policy = deny-all direct access by design.
alter table public.api_rate_limits enable row level security;
revoke all on public.api_rate_limits from anon, authenticated;

comment on table public.api_rate_limits is
  'Fixed-window request counters for /api/v1 API keys. Written only via record_api_request(); RLS enabled with no policy = deny-all direct access by design.';

-- ── Counter increment ────────────────────────────────────────────────────────
-- One round-trip: bump the current window and report whether the caller is
-- still under the limit. Also drops that key''s windows older than an hour so
-- the table self-cleans without a cron job.

create or replace function public.record_api_request(
  p_api_key_id     uuid,
  p_limit          integer,
  p_window_seconds integer
)
returns table(allowed boolean, request_count integer, retry_after_seconds integer)
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_window timestamptz;
  v_count  integer;
begin
  v_window := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  insert into public.api_rate_limits as arl (api_key_id, window_start, request_count)
    values (p_api_key_id, v_window, 1)
    on conflict (api_key_id, window_start)
      do update set request_count = arl.request_count + 1
    returning arl.request_count into v_count;

  delete from public.api_rate_limits
    where api_key_id = p_api_key_id
      and window_start < v_window - interval '1 hour';

  return query
    select
      v_count <= p_limit,
      v_count,
      greatest(
        1,
        ceil(extract(epoch from
          (v_window + make_interval(secs => p_window_seconds)) - clock_timestamp()
        ))::integer
      );
end;
$$;

revoke execute on function public.record_api_request(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.record_api_request(uuid, integer, integer)
  to service_role;
