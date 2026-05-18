-- Public-form bucket resolver.
--
-- After education_requests.bucket_id became NOT NULL at the application
-- layer (20260517000004), the public-intake submission flow needs a way
-- to pick a default bucket on behalf of the anonymous submitter. The
-- anon role doesn't have SELECT on allocation_buckets and shouldn't —
-- exposing the bucket list to the public form would leak workspace
-- structure to anyone holding any intake URL.
--
-- This RPC is SECURITY DEFINER + token-gated: it validates the supplied
-- intake-link token is active and unexpired, then returns the org's
-- best-fit bucket using the same heuristic as the schema migration
-- (Course Development → first non-archived by display order).
--
-- Callers (the public action) hand back a 404-style empty result when
-- the token is invalid, so token-probe attempts can't differentiate
-- between "no such org" and "no buckets configured."

create or replace function public.public_intake_default_bucket(
  p_token uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
  v_bucket_id uuid;
begin
  select pil.org_id
    into v_org_id
    from public.public_intake_links pil
    where pil.token = p_token
      and pil.is_active = true
      and (pil.expires_at is null or pil.expires_at > now());
  if v_org_id is null then
    return null;
  end if;

  select b.id
    into v_bucket_id
    from public.allocation_buckets b
    where b.org_id = v_org_id
      and b.is_archived = false
      and (
        lower(b.name) like '%course%develop%'
        or lower(b.name) like '%develop%'
        or lower(b.name) like '%curric%'
      )
    order by b.display_order, b.created_at
    limit 1;
  if v_bucket_id is not null then
    return v_bucket_id;
  end if;

  select b.id
    into v_bucket_id
    from public.allocation_buckets b
    where b.org_id = v_org_id
      and b.is_archived = false
    order by b.display_order, b.created_at
    limit 1;
  return v_bucket_id;
end;
$$;

revoke execute on function public.public_intake_default_bucket(uuid) from public;
grant  execute on function public.public_intake_default_bucket(uuid) to anon, authenticated;
