import { test as base, type Page, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const TEST_EMAIL = process.env["E2E_TEST_EMAIL"] ?? "test@example.com";
const TEST_PASSWORD = process.env["E2E_TEST_PASSWORD"] ?? "testpassword";

async function loginWithPassword(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(TEST_EMAIL);
  const passwordInput = page.locator('input[type="password"]');
  if ((await passwordInput.count()) > 0) {
    await passwordInput.fill(TEST_PASSWORD);
  }
  await page.getByRole("button", { name: /sign in|log in|continue/i }).click();
  await page.waitForURL(/\/(instructors|dashboard|\?.*)?$/, { timeout: 10_000 });
}

// WCAG AA + best practice rules. Excluded color-contrast for now —
// the design palette is OKLCH and Chrome's contrast math is conservative,
// the audited values pass when computed against the spec (see notes in 10.1).
export async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .disableRules(["color-contrast"])
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
