import { test as base, type Page, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const TEST_EMAIL = process.env["E2E_TEST_EMAIL"] ?? "test@example.com";
const TEST_PASSWORD = process.env["E2E_TEST_PASSWORD"] ?? "testpassword";

async function loginWithPassword(page: Page) {
  await page.goto("/login");
  // Page defaults to magic-link mode; flip to password mode first.
  const toPasswordToggle = page.getByRole("button", { name: /sign in with password instead/i });
  if (await toPasswordToggle.isVisible().catch(() => false)) {
    await toPasswordToggle.click();
  }
  await page.getByLabel(/email/i).fill(TEST_EMAIL);
  await page.getByLabel(/password/i).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  // Server action redirect lands on /, which (authenticated) layout serves.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
}

// WCAG AA + best practice rules.
export async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}

export const test = base.extend<{ authedPage: Page }>({
  authedPage: async ({ page }, provide) => {
    await loginWithPassword(page);
    await provide(page);
  },
});

export { expect, AxeBuilder };
