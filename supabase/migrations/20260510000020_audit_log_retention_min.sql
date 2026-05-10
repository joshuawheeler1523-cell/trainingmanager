-- =============================================================================
-- Phase 7 follow-up: minimum retention floor on audit_log
-- =============================================================================
-- Without this floor, a manager misclick (or a compromised manager) could
-- set audit_log_retention_days = 1, and the next monthly purge_expired_audit_logs
-- run would wipe ~99% of the org's audit history — including the SOC 2
-- evidence trail and any forensic data needed to investigate the breach
-- that just compromised them.
-- =============================================================================

alter table public.organizations
  add constraint organizations_audit_retention_min
  check (audit_log_retention_days is null or audit_log_retention_days >= 30);

comment on constraint organizations_audit_retention_min on public.organizations is
  'Minimum 30-day retention floor for audit_log. NULL still allowed (falls back to platform default). Prevents accidental or malicious history wipes.';
