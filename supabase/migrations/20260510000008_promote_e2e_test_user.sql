-- =============================================================================
-- Promote the existing e2e-test@arbor.local user to manager
-- =============================================================================
-- Phase 2 migrated all 'member' rows to 'instructor'. The Playwright fixture
-- in apps/web/e2e/fixtures/auth.ts uses e2e-test@arbor.local for end-to-end
-- tests, including instructors.spec.ts which CREATEs an instructor row —
-- which Phase 4 RLS now blocks for instructor-role users (manager-only).
--
-- Promote this user to 'manager' so the existing E2E suite continues to
-- work as a manager smoke test. Per-role E2E coverage (instructor + viewer
-- specs) needs additional test users — see apps/web/e2e/README-roles.md.
--
-- DOWN: update public.org_memberships set role = 'instructor'
--   where user_id = 'a15a5b1e-b646-4f9f-96e8-c0d36c52ecc5';
-- =============================================================================

update public.org_memberships
  set role = 'manager'
  where user_id = 'a15a5b1e-b646-4f9f-96e8-c0d36c52ecc5'
    and role = 'instructor';
