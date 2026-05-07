import { test as base, type Page } from "@playwright/test";

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

export const test = base.extend<{ authedPage: Page }>({
  authedPage: async ({ page }, provide) => {
    await loginWithPassword(page);
    await provide(page);
  },
});

export { expect } from "@playwright/test";
