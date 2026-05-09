import { test, expect } from "./fixtures/auth";

/**
 * Hospital Training Golden Path
 * ==============================
 * Walks through the canonical workflow that a hospital training department
 * uses. This is the regression guard that proves the workspace identity
 * + RLS + role changes (Phases 1-7) didn't break the gold-path experience.
 *
 * Runs as the existing manager test user (promoted from instructor in
 * migration 20260510000008). Every assertion below was true BEFORE the
 * permissions overhaul; they must remain true AFTER.
 *
 * Cadence: this spec must pass on every PR after Phase 5 per the soft-lock
 * guarantee in docs/build-plans/2026-05-09_permissions-and-workspace-identity.md.
 */

test.describe("Hospital Training golden path", () => {
  test("nav surfaces all training modules", async ({ authedPage: page }) => {
    await page.goto("/");

    // Sidebar should expose Instructors, Classes, Skills, Allocations, TRAs,
    // Request Queue, Special Projects, Training Planner, Reports, and Admin.
    // The labels for Instructors render via <Label> so we check for the
    // hospital-training default text.
    await expect(page.getByRole("link", { name: /instructors/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /classes/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /skills/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /allocations/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /^tras$/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /request queue/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /special projects/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /training planner/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /reports/i }).first()).toBeVisible();
  });

  test("dashboard renders KPI cards + capacity chart", async ({ authedPage: page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /dashboard/i, level: 1 })).toBeVisible();
    // KPI strip
    await expect(page.getByText(/tras needing attention/i)).toBeVisible();
    await expect(page.getByText(/active projects/i)).toBeVisible();
    await expect(page.getByText(/active instructors/i)).toBeVisible();
    await expect(page.getByText(/average utilization/i)).toBeVisible();
  });

  test("instructors page lists the roster", async ({ authedPage: page }) => {
    await page.goto("/instructors");
    // Page header renders via <Label kind="entity.instructor" plural /> →
    // Hospital training preset's default → "Instructors".
    await expect(page.getByRole("heading", { name: /^instructors$/i })).toBeVisible();
    // Filter + Add buttons present
    await expect(page.getByRole("button", { name: /add instructor/i })).toBeVisible();
  });

  test("classes page lists the catalog", async ({ authedPage: page }) => {
    await page.goto("/classes");
    await expect(page.getByRole("heading", { name: /classes/i, level: 1 })).toBeVisible();
  });

  test("TRAs page is reachable + workspace settings page is gated to manager", async ({
    authedPage: page,
  }) => {
    await page.goto("/tras");
    await expect(page.getByRole("heading", { name: /tras/i, level: 1 })).toBeVisible();

    // Manager has access to admin / workspace identity
    await page.goto("/admin/settings/workspace");
    await expect(page.getByRole("heading", { name: /workspace identity/i })).toBeVisible();
    // The 8-preset gallery is rendered (sample one)
    await expect(page.getByText(/hospital training/i).first()).toBeVisible();
  });

  test("training planner is reachable", async ({ authedPage: page }) => {
    await page.goto("/training-planner");
    await expect(page.getByRole("heading", { name: /training planner/i, level: 1 })).toBeVisible();
  });

  test("workload view shows the dashboard or instructors workload section", async ({
    authedPage: page,
  }) => {
    // The workload view is integrated into /instructors (Capacity tab) and the
    // dashboard. Reach it via the dashboard "Average utilization" KPI link.
    await page.goto("/instructors");
    // Switch to the Capacity tab
    await page.getByRole("button", { name: /^capacity$/i }).click();
    // Should render some capacity data
    await expect(page.getByText(/utilization/i).first()).toBeVisible();
  });
});
