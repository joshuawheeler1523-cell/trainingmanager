-- =============================================================================
-- Phase aftermath hardening
-- =============================================================================
-- Resolves three bugs found in the post-build audit:
--   1. SECURITY DEFINER functions exposed to public via PostgREST RPC
--      → tenant users could wipe audit_log + mint invoices + enumerate
--        every agency's contract values
--   2. arbor_invoices has no unique constraint on (agency, period) →
--      concurrent invoice generation can mint duplicates
--   3. (Code-side fix lands in apps/web/src/lib/webhooks.ts; this migration
--      doesn't touch it.)
-- =============================================================================

-- ── Lock down dangerous SECURITY DEFINER functions ─────────────────────────
-- Postgres' default GRANT EXECUTE TO PUBLIC is the wrong default for these.

revoke execute on function public.generate_monthly_invoices_for_period(date, date)
  from public, anon, authenticated;
grant execute on function public.generate_monthly_invoices_for_period(date, date)
  to service_role;

revoke execute on function public.purge_expired_audit_logs(integer)
  from public, anon, authenticated;
grant execute on function public.purge_expired_audit_logs(integer)
  to service_role;

revoke execute on function public.next_invoice_number()
  from public, anon, authenticated;
grant execute on function public.next_invoice_number()
  to service_role;

revoke execute on function public.calculate_period_rev_share(uuid, date, date)
  from public, anon, authenticated;
grant execute on function public.calculate_period_rev_share(uuid, date, date)
  to service_role;

-- ── Prevent duplicate invoices for the same period ────────────────────────
-- Closes the race where two concurrent generateInvoiceNow calls (or
-- generateInvoiceNow racing with the monthly cron) both pass the existence
-- check and both insert. Idempotency now enforced at the DB layer rather
-- than relying on application code.

alter table public.arbor_invoices
  add constraint arbor_invoices_unique_period
  unique (agency_id, period_start, period_end);
