import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve({ from: mockFrom })),
}));

const mockGetCurrentOrgId = vi.fn();
vi.mock("@/lib/auth/current-org", () => ({
  getCurrentOrgId: mockGetCurrentOrgId,
}));

const mockGetCurrentDepartmentId = vi.fn();
vi.mock("@/lib/auth/current-department", () => ({
  getCurrentDepartmentId: mockGetCurrentDepartmentId,
}));

const {
  createRecurringTask,
  saveRecurringAssignments,
  setRecurringTaskStatus,
  createAdHocTask,
  setAdHocTaskStatus,
} = await import("./task-actions");
const { recurringAnnualHours, effectiveOccurrencesPerYear, FREQUENCY_TO_ANNUAL } =
  await import("@arbor/shared");

const ORG_ID = "aaaaaaaa-0000-0000-0000-000000000000";
const TASK_ID = "bbbbbbbb-0000-0000-0000-000000000000";
const INSTRUCTOR_ID = "cccccccc-0000-0000-0000-000000000000";
const INSTRUCTOR_ID_2 = "dddddddd-0000-0000-0000-000000000000";

function makeInsertChain(result: { data?: unknown; error?: unknown }) {
  return {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentOrgId.mockResolvedValue(ORG_ID);
  mockGetCurrentDepartmentId.mockResolvedValue("dddddddd-0000-0000-0000-000000000000");
});

describe("createRecurringTask", () => {
  it("rejects when name is empty", async () => {
    const result = await createRecurringTask({
      name: "",
      hours_per_occurrence: 1,
      frequency: "weekly",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  it("rejects an unknown frequency", async () => {
    const result = await createRecurringTask({
      name: "Bad",
      hours_per_occurrence: 1,
      frequency: "fortnightly",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  it("succeeds with weekly + 2 hrs (defaults to 52 occ/yr)", async () => {
    mockFrom.mockReturnValue(
      makeInsertChain({
        data: {
          id: TASK_ID,
          org_id: ORG_ID,
          name: "Weekly Huddle",
          frequency: "weekly",
          hours_per_occurrence: 2,
          occurrences_per_year: null,
        },
        error: null,
      }),
    );
    const result = await createRecurringTask({
      name: "Weekly Huddle",
      hours_per_occurrence: 2,
      frequency: "weekly",
    });
    expect(result.ok).toBe(true);
  });

  it("returns NO_ORG when org context missing", async () => {
    mockGetCurrentOrgId.mockResolvedValue(null);
    const result = await createRecurringTask({
      name: "X",
      hours_per_occurrence: 1,
      frequency: "weekly",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NO_ORG");
  });
});

describe("setRecurringTaskStatus", () => {
  it("rejects an invalid status string", async () => {
    const result = await setRecurringTaskStatus(TASK_ID, "wat" as never);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });
});

describe("saveRecurringAssignments", () => {
  it("rejects when shares don't sum to 100", async () => {
    const result = await saveRecurringAssignments(TASK_ID, [
      { instructor_id: INSTRUCTOR_ID, share_percent: 50 },
      { instructor_id: INSTRUCTOR_ID_2, share_percent: 40 },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION");
      expect(result.error.message).toContain("100");
    }
  });

  it("accepts an empty slate (unassigned task)", async () => {
    mockFrom.mockReturnValue({
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
    });
    const result = await saveRecurringAssignments(TASK_ID, []);
    expect(result.ok).toBe(true);
  });

  it("rejects a non-uuid instructor_id", async () => {
    const result = await saveRecurringAssignments(TASK_ID, [
      { instructor_id: "not-a-uuid", share_percent: 100 },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });
});

describe("createAdHocTask", () => {
  it("rejects when name is empty", async () => {
    const result = await createAdHocTask({ name: "", hours: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  it("succeeds with a minimal record", async () => {
    mockFrom.mockReturnValue(
      makeInsertChain({
        data: {
          id: "adhoc-1111",
          org_id: ORG_ID,
          name: "Pull a report",
          hours: 1,
          status: "open",
        },
        error: null,
      }),
    );
    const result = await createAdHocTask({ name: "Pull a report", hours: 1 });
    expect(result.ok).toBe(true);
  });
});

describe("setAdHocTaskStatus", () => {
  it("rejects an invalid status string", async () => {
    const result = await setAdHocTaskStatus("adhoc-1111", "completed" as never);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });
});

describe("recurringAnnualHours (DOD: matches expected values)", () => {
  it("weekly + 2 hrs/occurrence, no override = 104 annual hours", () => {
    const annual = recurringAnnualHours({
      frequency: "weekly",
      occurrences_per_year: null,
      hours_per_occurrence: 2,
    });
    expect(annual).toBe(104);
  });

  it("weekly + 2 hrs/occurrence, override 30 = 60 annual hours", () => {
    const annual = recurringAnnualHours({
      frequency: "weekly",
      occurrences_per_year: 30,
      hours_per_occurrence: 2,
    });
    expect(annual).toBe(60);
  });

  it("share_percent reduces annual hours proportionally", () => {
    // Weekly + 2hrs default = 104. 25% share = 26.
    const annual = recurringAnnualHours({
      frequency: "weekly",
      occurrences_per_year: null,
      hours_per_occurrence: 2,
      share_percent: 25,
    });
    expect(annual).toBe(26);
  });

  it("effectiveOccurrencesPerYear falls back to per-frequency default", () => {
    expect(effectiveOccurrencesPerYear({ frequency: "monthly", occurrences_per_year: null })).toBe(
      FREQUENCY_TO_ANNUAL.monthly,
    );
    expect(effectiveOccurrencesPerYear({ frequency: "monthly", occurrences_per_year: 6 })).toBe(6);
  });
});
