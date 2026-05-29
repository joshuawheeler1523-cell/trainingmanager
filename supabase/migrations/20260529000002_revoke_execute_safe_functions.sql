-- Revoke unnecessary EXECUTE grants on SECURITY DEFINER functions.
--
-- Background: Supabase's security advisor flagged 79 grant rows across 41
-- SECURITY DEFINER functions executable by anon / authenticated. CLAUDE.md
-- explicitly calls this out as a known recurring bug ("Forgetting to revoke
-- EXECUTE on SECURITY DEFINER functions → public RPC exposure").
--
-- This migration locks down the obviously safe 13 — the ones whose intent
-- is unambiguous from their role in the system:
--
-- 1. Trigger functions (9). Fire automatically from Postgres triggers; the
--    trigger runs under the table owner's privileges, not the calling
--    user's, so SQL-level EXECUTE grants are unnecessary. Locking them
--    closes the "anyone can call write_audit_log as an RPC" surface.
--
-- 2. Scheduled-job notification functions (2). Called by pg_cron / service_role
--    only; no app code calls them as RPCs.
--
-- 3. mark_notification_read / mark_all_notifications_read (2). User actions
--    that mark THEIR OWN notifications read — should require authentication.
--    Anon callers have no notifications to mark; the grant is just surface.
--
-- Functions intentionally LEFT executable by anon/authenticated:
--   - RLS helpers (is_manager, is_instructor, user_org_ids, etc.) — called
--     from {public} role RLS policies; locking them would break RLS.
--   - Pre-auth designed-public RPCs (lookup_sso_for_email_domain,
--     lookup_invitation_by_token, accept_invitation, set_share_token,
--     lookup_agency_by_domain, public_intake_default_bucket).
--   - Authenticated-context helpers (current_user_id, current_user_email,
--     current_instructor_id, etc.).
--
-- A future pass will inspect the 4 "possible leak" functions individually
-- (effective_allocation, qualified_instructors_for_class,
-- default_department_for_org, public_intake_default_bucket).

-- ── Trigger functions ───────────────────────────────────────────────────────
-- These run inside trigger context; SQL-level EXECUTE grants are surface,
-- not requirement. Triggers fire under the table owner's privileges.

REVOKE EXECUTE ON FUNCTION public.bump_saved_report_last_run() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_offering_assignments() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.compute_deliverable_estimated_hours() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_instructor_column_acl_instructors() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_instructor_column_acl_tasks() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_tra_total() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.support_ticket_message_after_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.write_audit_log() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.write_request_history() FROM PUBLIC, anon, authenticated;

-- ── Scheduled-job functions ────────────────────────────────────────────────
-- Run via pg_cron under service_role / postgres. No RPC surface needed.

REVOKE EXECUTE ON FUNCTION public.notify_aging_requests() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_expiring_certifications() FROM PUBLIC, anon, authenticated;

-- ── Authenticated-only user actions ────────────────────────────────────────
-- Lock anon out; keep the authenticated grant (the app calls these
-- via supabase-js as the signed-in user).

REVOKE EXECUTE ON FUNCTION public.mark_notification_read(p_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_all_notifications_read() FROM PUBLIC, anon;
