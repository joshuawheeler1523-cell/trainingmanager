-- Two small security cleanups from the advisor's remaining findings:
--
-- 1. Drop the redundant `agency_branding_public_read` storage SELECT policy.
--    Why: the bucket is already `public = true`, which serves object URLs
--    directly via the storage public endpoint. The broad SELECT policy was
--    additionally enabling the LIST API on storage.objects, letting any
--    client enumerate every file in the bucket. The advisor's
--    public_bucket_allows_listing lint flagged this.
--
--    Verified non-breaking: app code only calls .upload() (covered by the
--    agency_branding_admin_write INSERT policy) and getPublicUrl() (pure
--    URL construction, no API call). No .list() calls exist on this bucket.
--
-- 2. Document the intentional locked-down state of agency_signup_attempts.
--    The table has RLS enabled with no policies — the advisor's
--    rls_enabled_no_policy lint flags this as "is this intentional?"
--    Answer: yes. This is a server-side rate-limit log; the anon signup
--    route writes via SECURITY DEFINER server actions using service_role,
--    and there should be no direct PostgREST client access from anon /
--    authenticated. RLS-enabled-with-no-policies is the correct
--    deny-all-clients state. Adding a COMMENT so the intent is on the
--    schema rather than buried in a migration message.

-- ── Drop redundant public-read storage policy ──────────────────────────────
DROP POLICY IF EXISTS agency_branding_public_read ON storage.objects;

-- ── Document agency_signup_attempts intent ─────────────────────────────────
COMMENT ON TABLE public.agency_signup_attempts IS
  'Server-side rate-limit log for the anon /agency-signup flow. Intentionally has RLS enabled with NO policies — direct client access (anon / authenticated) is denied; only server actions running as service_role write and read. The Supabase advisor rls_enabled_no_policy lint will flag this; the design is correct.';
