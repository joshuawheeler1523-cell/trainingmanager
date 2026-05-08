import { test, expect, expectNoA11yViolations, AxeBuilder } from "./fixtures/auth";

// Smoke test: every authenticated top-level route should have zero
// WCAG 2.1 A/AA violations from axe-core (color-contrast excluded — see
// fixture comment).
const TOP_ROUTES = [
  "/dashboard",
  "/instructors",
  "/classes",
  "/allocations",
  "/projects",
  "/tras",
  "/training-planner",
  "/reports",
] as const;

for (const path of TOP_ROUTES) {
  test(`a11y: ${path} has no axe violations`, async ({ authedPage: page }) => {
    await page.goto(path);
    // Give SSR + client hydration a moment so React renders any conditional UI.
    await page.waitForLoadState("networkidle");
    await expectNoA11yViolations(page);
  });
}

// Login is its own thing — no auth fixture.
test("a11y: /login has no axe violations", async ({ page }) => {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
});
