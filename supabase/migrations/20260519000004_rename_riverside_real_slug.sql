-- The user's real working org (containing DCH Care Connect and LCMH Care
-- Connect impls) shared the slug 'riverside-memorial-hospital' with the
-- demo-seed action. Re-seeding would have wiped the real impls via FK
-- cascade. Rename the real org's slug so the demo seed creates a separate
-- org and the two coexist.
--
-- Slug is display-only (no URL routing, no auth lookup uses it) — checked
-- before applying. Org id remains the same so sessions / memberships are
-- untouched.

update public.organizations
set slug = 'riverside-memorial-prod'
where id = 'd6aa953c-e76d-4ef4-892d-3fa2869dde13'
  and slug = 'riverside-memorial-hospital';
