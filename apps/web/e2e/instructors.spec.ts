import { test, expect } from "./fixtures/auth";

const INSTRUCTOR_NAME = `E2E Test Instructor ${String(Date.now())}`;
const INSTRUCTOR_EMAIL = `e2e-${String(Date.now())}@example.com`;
const UPDATED_JOB_TITLE = "Updated Senior Trainer";

test.describe("Instructors CRUD", () => {
  test("create → view → edit → archive → restore", async ({ authedPage: page }) => {
    // ── 1. Navigate to instructors list ──────────────────────────────────────
    await page.goto("/instructors");
    await expect(page.getByRole("heading", { name: "Instructors" })).toBeVisible();

    // ── 2. Open Add Instructor dialog ─────────────────────────────────────────
    await page.getByRole("button", { name: /add instructor/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // ── 3. Fill in the form ───────────────────────────────────────────────────
    await page.getByLabel(/full name/i).fill(INSTRUCTOR_NAME);
    await page.getByLabel(/email/i).fill(INSTRUCTOR_EMAIL);
    await page.getByLabel(/department/i).fill("E2E Department");
    await page.getByLabel(/annual hours/i).fill("2000");

    // ── 4. Submit ─────────────────────────────────────────────────────────────
    await page
      .getByRole("button", { name: /add instructor/i })
      .last()
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 5_000 });

    // ── 5. Verify instructor appears in list ──────────────────────────────────
    await expect(page.getByText(INSTRUCTOR_NAME)).toBeVisible({ timeout: 5_000 });

    // ── 6. Click into detail page ──────────────────────────────────────────────
    await page.getByText(INSTRUCTOR_NAME).click();
    await expect(page).toHaveURL(/\/instructors\/.+/);
    await expect(page.getByRole("heading", { name: INSTRUCTOR_NAME })).toBeVisible();

    // ── 7. Edit the instructor ─────────────────────────────────────────────────
    await page.getByRole("button", { name: /edit/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    const jobTitleInput = page.getByLabel(/job title/i);
    await jobTitleInput.fill(UPDATED_JOB_TITLE);
    await page.getByRole("button", { name: /save changes/i }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 5_000 });

    // Verify updated job title appears
    await expect(page.getByText(UPDATED_JOB_TITLE)).toBeVisible({ timeout: 5_000 });

    // ── 8. Archive the instructor ──────────────────────────────────────────────
    await page.getByRole("button", { name: /archive/i }).click();
    // Confirm dialog appears
    await expect(page.getByRole("dialog", { name: /archive instructor/i })).toBeVisible();
    await page.getByRole("button", { name: /^archive$/i }).click();

    // Should redirect to list
    await expect(page).toHaveURL("/instructors", { timeout: 5_000 });

    // Instructor no longer visible in default list
    await expect(page.getByText(INSTRUCTOR_NAME)).not.toBeVisible();

    // ── 9. Show archived and restore ─────────────────────────────────────────
    await page.getByRole("checkbox", { name: /show archived/i }).check();
    await expect(page.getByText(INSTRUCTOR_NAME)).toBeVisible({ timeout: 5_000 });

    await page.getByText(INSTRUCTOR_NAME).click();
    await expect(page.getByText("Archived")).toBeVisible();

    await page.getByRole("button", { name: /restore/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: /^restore$/i }).click();

    // Archived badge gone after restore
    await expect(page.getByText("Archived")).not.toBeVisible({ timeout: 5_000 });

    // ── 10. Verify Audit tab shows events ─────────────────────────────────────
    await page.getByRole("button", { name: "Audit" }).click();
    // Should show at least one INSERT event from creation
    await expect(page.getByText("INSERT")).toBeVisible({ timeout: 5_000 });
  });

  test("search filters instructors by name", async ({ authedPage: page }) => {
    await page.goto("/instructors");
    const searchInput = page.getByPlaceholder(/search by name/i);
    await searchInput.fill("ZZZNOMATCH");
    await expect(page.getByText(/no instructors yet|no archived/i)).toBeVisible({ timeout: 3_000 });
  });
});
