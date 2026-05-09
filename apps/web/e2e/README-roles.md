# E2E Roles — Test User Setup

The 3-role E2E suite (`three-roles.spec.ts`) needs three test users:

| Role       | Status         | Setup                                                                                                      |
| ---------- | -------------- | ---------------------------------------------------------------------------------------------------------- |
| Manager    | ✅ Provisioned | `e2e-test@arbor.local` (promoted via migration 20260510000008). Used by the existing `authedPage` fixture. |
| Instructor | ⚠️ Pending     | Create `e2e-instructor@arbor.local` (see steps below)                                                      |
| Viewer     | ⚠️ Pending     | Create `e2e-viewer@arbor.local` (see steps below)                                                          |

## Provisioning instructor + viewer test users

1. **Create auth user** via Supabase Studio:
   - Authentication → Users → + Add user
   - Email: `e2e-instructor@arbor.local` (or `e2e-viewer@arbor.local`)
   - Set a password and remember it
   - Auto-confirm = on
2. **Add org_memberships row** (use SQL Editor):
   ```sql
   insert into public.org_memberships (org_id, user_id, role, accepted_at)
   values (
     'a0000000-0000-0000-0000-000000000001',  -- Mercy Health (Demo)
     '<auth user id>',
     'instructor',  -- or 'viewer'
     now()
   );
   ```
3. **(Instructor only) Link to an instructors row** so `current_instructor_id()` returns non-NULL:
   ```sql
   update public.instructors
     set user_id = '<auth user id>'
     where org_id = 'a0000000-0000-0000-0000-000000000001'
       and email = 'e2e-instructor@arbor.local'
       and user_id is null
     returning id;
   -- If no row matches by email, create one first:
   -- insert into public.instructors (org_id, department_id, full_name, email,
   --                                  user_id, annual_hours, status)
   --   values ('a0000000-...', '<dept-id>', 'E2E Instructor',
   --           'e2e-instructor@arbor.local', '<auth user id>', 1880, 'active');
   ```
4. **Add credentials to `apps/web/.env.local`**:
   ```
   E2E_INSTRUCTOR_EMAIL=e2e-instructor@arbor.local
   E2E_INSTRUCTOR_PASSWORD=<password from step 1>
   E2E_VIEWER_EMAIL=e2e-viewer@arbor.local
   E2E_VIEWER_PASSWORD=<password from step 1>
   ```
5. **Remove `.skip`** from the relevant `test.describe.skip(...)` blocks in `three-roles.spec.ts`.

## Why this isn't automated

Auth user creation needs the Supabase Auth admin API (with service role) which we don't expose to migrations. The existing test user was created during the original e2e setup and has been carried forward; the additional users are a one-time per-env setup.

A future improvement: a setup script in `apps/web/e2e/scripts/seed-test-users.ts` that uses `@supabase/supabase-js` with the service role key to provision users idempotently.
