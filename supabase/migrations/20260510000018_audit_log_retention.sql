-- =============================================================================
-- White-Label Phase 7 — SOC 2: audit log retention policy
-- =============================================================================
-- SOC 2 Type II expects a documented retention policy for security-relevant
-- logs. We default to 5 years (1825 days) which covers the typical audit
-- window plus a buffer for healthcare regulatory requests.
--
-- Implemented as a callable function rather than pg_cron so we can wire it
-- to the existing monthly invoice cron schedule (or trigger via Vercel
-- Cron) without taking on a new pg_cron dependency.
-- =============================================================================

-- Per-org override of retention days; NULL falls back to the platform default.
alter table public.organizations
  add column audit_log_retention_days integer;

comment on column public.organizations.audit_log_retention_days is
  'How many days to retain audit_log entries for this org. NULL = platform default (1825 = 5y).';

create or replace function public.purge_expired_audit_logs(
  p_default_retention_days integer default 1825
)
  returns table (org_id uuid, deleted_count bigint)
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_org record;
  v_cutoff timestamptz;
  v_count bigint;
begin
  for v_org in
    select o.id, coalesce(o.audit_log_retention_days, p_default_retention_days) as retention_days
    from public.organizations o
  loop
    v_cutoff := now() - (v_org.retention_days || ' days')::interval;
    delete from public.audit_log
      where org_id = v_org.id and created_at < v_cutoff;
    get diagnostics v_count = row_count;
    if v_count > 0 then
      org_id := v_org.id;
      deleted_count := v_count;
      return next;
    end if;
  end loop;
  return;
end;
$$;

comment on function public.purge_expired_audit_logs(integer) is
  'Deletes audit_log rows older than each org''s configured retention window. Call from monthly cron. Returns one row per org with deleted_count.';
