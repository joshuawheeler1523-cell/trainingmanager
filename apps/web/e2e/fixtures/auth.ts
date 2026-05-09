import { test as base, type Page, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const TEST_EMAIL = process.env["E2E_TEST_EMAIL"] ?? "test@example.com";
const TEST_PASSWORD = process.env["E2E_TEST_PASSWORD"] ?? "testpassword";
const INSTRUCTOR_EMAIL = process.env["E2E_INSTRUCTOR_EMAIL"];
const INSTRUCTOR_PASSWORD = process.env["E2E_INSTRUCTOR_PASSWORD"];
const VIEWER_EMAIL = process.env["E2E_VIEWER_EMAIL"];
const VIEWER_PASSWORD = process.env["E2E_VIEWER_PASSWORD"];

async function loginWithPassword(page: Page, email: string, password: string) {
  await page.goto("/login");
  // Page defaults to magic-link mode; flip to password mode first.
  const toPasswordToggle = page.getByRole("button", { name: /sign in with password instead/i });
  if (await toPasswordToggle.isVisible().catch(() => false)) {
    await toPasswordToggle.click();
  }
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
}

// WCAG AA + best practice rules.
export async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}

export const test = base.extend<{
  authedPage: Page;
  managerPage: Page;
  instructorPage: Page;
  viewerPage: Page;
}>({
  /** Default authed user (the manager — see migration 20260510000008). */
  authedPage: async ({ page }, provide) => {
    await loginWithPassword(page, TEST_EMAIL, TEST_PASSWORD);
    await provide(page);
  },

  /** Manager (alias of authedPage). Use this when the test's intent is role-specific. */
  managerPage: async ({ page }, provide) => {
    await loginWithPassword(page, TEST_EMAIL, TEST_PASSWORD);
    await provide(page);
  },

  /** Instructor. Skipped at runtime if E2E_INSTRUCTOR_* env vars aren't set. */
  instructorPage: async ({ page }, provide) => {
    if (!INSTRUCTOR_EMAIL || !INSTRUCTOR_PASSWORD) {
      test.skip(
        true,
        "E2E_INSTRUCTOR_EMAIL/PASSWORD not set. Run `pnpm seed:e2e-users` and add to apps/web/.env.local.",
      );
      await provide(page);
      return;
    }
    await loginWithPassword(page, INSTRUCTOR_EMAIL, INSTRUCTOR_PASSWORD);
    await provide(page);
  },

  /** Viewer. Skipped at runtime if E2E_VIEWER_* env vars aren't set. */
  viewerPage: async ({ page }, provide) => {
    if (!VIEWER_EMAIL || !VIEWER_PASSWORD) {
      test.skip(
        true,
        "E2E_VIEWER_EMAIL/PASSWORD not set. Run `pnpm seed:e2e-users` and add to apps/web/.env.local.",
      );
      await provide(page);
      return;
    }
    await loginWithPassword(page, VIEWER_EMAIL, VIEWER_PASSWORD);
    await provide(page);
  },
});

export { expect, AxeBuilder };
