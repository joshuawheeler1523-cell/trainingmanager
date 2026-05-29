-- Lock down the 4 "ambiguous" SECURITY DEFINER functions surfaced by the
-- security advisor. Per-function rationale below.
--
-- This continues the work in 20260529000002 (which locked the
-- unambiguously-safe 13). After this migration, of the original 41 flagged
-- functions, 16 are locked, 24 remain intentionally executable as designed
-- (RLS helpers + pre-auth lookup RPCs + authenticated context helpers).

-- ── default_department_for_org(p_org_id uuid) ──────────────────────────────
-- Returns the 'general'-slug department for an org. UNUSED — referenced
-- only by auto-generated database.types.ts in apps/web. No call sites
-- across the app or other DB functions (grep + pg_proc body scan). Likely
-- a leftover helper from the departments migration. Revoke entirely; if
-- something needs it later, we re-grant explicitly.

REVOKE EXECUTE ON FUNCTION public.default_department_for_org(p_org_id uuid) FROM PUBLIC, anon, authenticated;

-- ── effective_allocation(p_instructor_id uuid) ─────────────────────────────
-- Returns an instructor's effective allocation breakdown (individual →
-- group → global fallback). UNUSED in app code — only a comment in
-- allocations/individuals-tab.tsx references it conceptually; no rpc()
-- call. Probably superseded by the manual aggregation that tab does
-- client-side. Lock down for now; can re-grant if a future use needs it.

REVOKE EXECUTE ON FUNCTION public.effective_allocation(p_instructor_id uuid) FROM PUBLIC, anon, authenticated;

-- ── qualified_instructors_for_class(p_class_id uuid) ───────────────────────
-- Called from classes/[id]/page.tsx (authenticated) and lib/reports/coverage.ts.
-- Returns only instructor UUIDs — not names/emails — so the cross-tenant
-- leak surface is limited to enumeration counts on guessable class_ids.
-- The downstream UI joins back to the instructors table, which RLS gates.
-- Lock anon (no legit anon use); keep authenticated for the existing app
-- callers. A future pass could tighten further by adding an
-- `org_id IN (SELECT user_org_ids())` clause to the function body, but
-- that's a behavioral change we'd want to verify case-by-case.

REVOKE EXECUTE ON FUNCTION public.qualified_instructors_for_class(p_class_id uuid) FROM PUBLIC, anon;

-- ── public_intake_default_bucket(p_token uuid) ─────────────────────────────
-- LEFT INTACT. By design called from /public/request/[token]/actions.ts as
-- the anon submitter; the token itself is the access gate (function returns
-- NULL when the token is invalid or expired). The earlier migration
-- 20260517000005_public_intake_default_bucket explicitly granted anon and
-- authenticated. No change.
