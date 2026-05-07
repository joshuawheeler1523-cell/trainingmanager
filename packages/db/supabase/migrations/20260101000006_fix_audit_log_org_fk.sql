-- audit_log.org_id must not FK to organizations — the AFTER DELETE trigger on
-- organizations fires after the row is gone, causing an FK violation when the
-- trigger tries to record the deletion.  Audit records are historical and must
-- outlive the org they reference.

alter table public.audit_log
  drop constraint audit_log_org_id_fkey;
