import { test, expect } from "./fixtures/auth";

/**
 * Three-Role E2E Suite
 * =====================
 * Walks each role (manager, instructor, viewer) through smoke flows that
 * exercise their RLS scope + UI gating.
 *
 * Setup: run `pnpm seed:e2e-users` once to provision the instructor + viewer
 * test users (idempotent), then add the printed credentials to
 * apps/web/.env.local. Without those env vars set, the instructor + viewer
 * suites skip themselves at runtime.
 */

test.describe("Manager", () => {
  test("can reach /admin and /admin/settings/workspace", async ({ managerPage: page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: /organization administration/i })).toBeVisible();

    await page.goto("/admin/settings/workspace");
    await expect(page.getByRole("heading", { name: /workspace identity/i })).toBeVisible();
  });

  test("sees Add Instructor / manager-only actions in the UI", async ({ managerPage: page }) => {
    await page.goto("/instructors");
    await expect(page.getByRole("button", { name: /add instructor/i })).toBeVisible();
  });

  test("profile menu shows Manager role badge", async ({ managerPage: page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /profile menu/i }).click();
    await expect(page.getByLabel(/role: manager/i)).toBeVisible();
  });
});

test.describe("Instructor", () => {
  test("blocked from /admin (403 page)", async ({ instructorPage: page }) => {
    await page.goto("/admin");
    // RoleGuard renders the 403 surface with "Access denied".
    await expect(page.getByRole("heading", { name: /access denied/i })).toBeVisible();
  });

  test("blocked from /admin/settings/workspace", async ({ instructorPage: page }) => {
    await page.goto("/admin/settings/workspace");
    await expect(page.getByRole("heading", { name: /access denied/i })).toBeVisible();
  });

  test("profile menu shows Instructor role badge", async ({ instructorPage: page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /profile menu/i }).click();
    await expect(page.getByLabel(/role: instructor/i)).toBeVisible();
  });

  test("can navigate /instructors but admin nav item is hidden", async ({
    instructorPage: page,
  }) => {
    await page.goto("/instructors");
    // Page renders; "Add instructor" button visibility is implementation-
    // dependent (RLS will block the action even if button shown).
    await expect(page.getByRole("heading", { name: /^instructors$/i })).toBeVisible();
    // Admin link should NOT appear in the sidebar for instructors.
    const adminLink = page.getByRole("link", { name: /organization admin/i });
    await expect(adminLink).toHaveCount(0);
  });
});

test.describe("Viewer", () => {
  test("blocked from /admin (403 page)", async ({ viewerPage: page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: /access denied/i })).toBeVisible();
  });

  test("profile menu shows Viewer role badge", async ({ viewerPage: page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /profile menu/i }).click();
    await expect(page.getByLabel(/role: viewer/i)).toBeVisible();
  });

  test("can read /instructors page", async ({ viewerPage: page }) => {
    await page.goto("/instructors");
    await expect(page.getByRole("heading", { name: /^instructors$/i })).toBeVisible();
  });

  test("admin nav item hidden in sidebar", async ({ viewerPage: page }) => {
    await page.goto("/");
    const adminLink = page.getByRole("link", { name: /organization admin/i });
    await expect(adminLink).toHaveCount(0);
  });
});
