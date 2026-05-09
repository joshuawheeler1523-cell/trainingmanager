import { test, expect } from "./fixtures/auth";

/**
 * Three-Role E2E Suite
 * =====================
 * Walks each role (manager, instructor, viewer) through smoke flows that
 * exercise their RLS scope + UI gating.
 *
 * STATUS: only the manager path runs today. The instructor + viewer paths
 * are skipped pending dedicated test users. To enable them:
 *   1. Create auth.users rows for e2e-instructor@arbor.local and
 *      e2e-viewer@arbor.local (use Supabase Studio → Authentication → Users).
 *   2. Add org_memberships rows with role='instructor' and role='viewer'
 *      respectively, both for the Mercy Health (Demo) org.
 *   3. For the instructor user: link to an instructors row by setting
 *      instructors.user_id = the new auth user's id.
 *   4. Add the credentials to apps/web/.env.local:
 *        E2E_INSTRUCTOR_EMAIL=...
 *        E2E_INSTRUCTOR_PASSWORD=...
 *        E2E_VIEWER_EMAIL=...
 *        E2E_VIEWER_PASSWORD=...
 *   5. Remove the .skip on the test.describe blocks below.
 *
 * The manager path uses the existing E2E_TEST_EMAIL/PASSWORD test user
 * (promoted to manager in migration 20260510000008).
 */

test.describe("Manager", () => {
  test("can reach /admin and /admin/settings/workspace", async ({ authedPage: page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: /organization administration/i })).toBeVisible();

    await page.goto("/admin/settings/workspace");
    await expect(page.getByRole("heading", { name: /workspace identity/i })).toBeVisible();
  });

  test("sees Add Instructor / Manager-only actions in the UI", async ({ authedPage: page }) => {
    await page.goto("/instructors");
    await expect(page.getByRole("button", { name: /add instructor/i })).toBeVisible();
  });

  test("profile menu shows Manager role badge", async ({ authedPage: page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /profile menu/i }).click();
    await expect(page.getByLabel(/role: manager/i)).toBeVisible();
  });
});

test.describe.skip("Instructor (needs E2E_INSTRUCTOR_* env vars)", () => {
  // TODO: implement after instructor test user is provisioned.
  // - Cannot reach /admin (403 page)
  // - Profile menu shows Instructor role badge
  // - Can navigate to /instructors but Add button is gated
  // - Can edit own instructor row (phone, notes) but not status
});

test.describe.skip("Viewer (needs E2E_VIEWER_* env vars)", () => {
  // TODO: implement after viewer test user is provisioned.
  // - Cannot reach /admin (403)
  // - Profile menu shows Viewer role badge
  // - All forms render with read-only banner
  // - Cannot click Add buttons (gated by RoleGate / RoleGuard)
});
