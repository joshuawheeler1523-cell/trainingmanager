-- =============================================================================
-- White-Label Phase 3 — Public domain → agency lookup RPC
-- =============================================================================
-- Middleware needs to resolve a Host header to an agency_id BEFORE the user
-- has authenticated (so the right brand/theme renders on the login page).
-- The agencies table's existing RLS (agencies_select_member) only permits
-- SELECT for accepted members, which would block this lookup.
--
-- This RPC bypasses RLS via SECURITY DEFINER but returns only (id, slug, name)
-- and only for VERIFIED custom_domain rows — no different from any DNS-level
-- inference an outsider could already make about a public hostname.
-- =============================================================================

create or replace function public.lookup_agency_by_domain(p_host text)
  returns table (
    id   uuid,
    slug text,
    name text
  )
  language sql stable security definer
  set search_path = ''
as $$
  -- citext lives in the extensions schema; search_path is empty so we
  -- qualify it explicitly. lower() works as a portable case-insensitive
  -- comparator without needing the citext cast.
  select a.id, a.slug::text, a.name
    from public.agencies a
    where lower(a.custom_domain::text) = lower(p_host)
      and a.custom_domain_verified_at is not null
    limit 1;
$$;

-- Grant to anon + authenticated. SECURITY DEFINER lets the function read
-- regardless of RLS but execute permission still has to be granted.
grant execute on function public.lookup_agency_by_domain(text) to anon, authenticated;

comment on function public.lookup_agency_by_domain(text) is
  'Public lookup of (id, slug, name) for an agency by verified custom_domain. Safe to call pre-auth — used by Next.js middleware to scope branding on custom-domain hosts. Only returns rows with custom_domain_verified_at IS NOT NULL.';
