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

// Mock the role helper so tests don't try to call the real Supabase RPC.
// Default to manager so existing happy-path tests keep passing; specific
// tests can override per-call to assert the FORBIDDEN branch.
vi.mock("@/lib/auth/role", () => ({
  getCurrentRole: vi.fn(() => Promise.resolve("manager")),
  isManager: vi.fn(() => Promise.resolve(true)),
}));

const { createTra, addDeliverable, markTraDocumented, markTraComplete, cancelTra } =
  await import("./actions");
const { computeDeliverableEstimatedHours, traPriorityToProjectPriority } =
  await import("@arbor/shared");

const ORG_ID = "aaaaaaaa-0000-0000-0000-000000000000";
const DEPT_ID = "dddddddd-0000-0000-0000-000000000000";
const TRA_ID = "bbbbbbbb-0000-0000-0000-000000000000";
const DELIVERABLE_TYPE_ID = "cccccccc-0000-0000-0000-000000000000";

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
  mockGetCurrentDepartmentId.mockResolvedValue(DEPT_ID);
});

describe("createTra", () => {
  it("rejects when project_name is empty", async () => {
    const result = await createTra({ project_name: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  it("rejects an unknown priority", async () => {
    const result = await createTra({ project_name: "X", priority: "yesterday" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  it("rejects an unknown needed_by_driver", async () => {
    const result = await createTra({
      project_name: "X",
      needed_by_driver: "asap",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  it("succeeds with a minimal valid record", async () => {
    mockFrom.mockReturnValue(
      makeInsertChain({
        data: { id: TRA_ID, org_id: ORG_ID, project_name: "Mobile training" },
        error: null,
      }),
    );
    const result = await createTra({ project_name: "Mobile training" });
    expect(result.ok).toBe(true);
  });

  it("returns NO_ORG when org context missing", async () => {
    mockGetCurrentOrgId.mockResolvedValue(null);
    const result = await createTra({ project_name: "X" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NO_ORG");
  });
});

describe("addDeliverable", () => {
  it("rejects a non-uuid deliverable_type_id", async () => {
    const result = await addDeliverable(TRA_ID, {
      deliverable_type_id: "not-a-uuid",
      name: "Module 1",
      seat_time_hours: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  it("rejects complexity_multiplier above 3.0", async () => {
    const result = await addDeliverable(TRA_ID, {
      deliverable_type_id: DELIVERABLE_TYPE_ID,
      name: "Module 1",
      seat_time_hours: 1,
      complexity_multiplier: 5,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe("complexity_multiplier");
  });

  it("rejects complexity_multiplier below 0.5", async () => {
    const result = await addDeliverable(TRA_ID, {
      deliverable_type_id: DELIVERABLE_TYPE_ID,
      name: "Module 1",
      seat_time_hours: 1,
      complexity_multiplier: 0.1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe("complexity_multiplier");
  });

  it("rejects quantity less than 1", async () => {
    const result = await addDeliverable(TRA_ID, {
      deliverable_type_id: DELIVERABLE_TYPE_ID,
      name: "Module 1",
      seat_time_hours: 1,
      quantity: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  it("succeeds with a valid deliverable", async () => {
    mockFrom.mockReturnValue(
      makeInsertChain({
        data: {
          id: "del-1",
          tra_id: TRA_ID,
          deliverable_type_id: DELIVERABLE_TYPE_ID,
          name: "Module 1",
          seat_time_hours: 1,
          quantity: 1,
          complexity_multiplier: 1.0,
          estimated_hours: 0,
        },
        error: null,
      }),
    );
    const result = await addDeliverable(TRA_ID, {
      deliverable_type_id: DELIVERABLE_TYPE_ID,
      name: "Module 1",
      seat_time_hours: 1,
    });
    expect(result.ok).toBe(true);
  });
});

describe("status transitions", () => {
  function makeReadAndUpdateChain(opts: {
    cur: { id: string; status: string; submitted_at: string | null } | null;
    next: { id: string; status: string };
  }) {
    let call = 0;
    return () => {
      call += 1;
      if (call === 1) {
        // First call is the read
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: opts.cur, error: null }),
        };
      }
      // Second call is the update
      return {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: opts.next, error: null }),
      };
    };
  }

  it("rejects markTraDocumented when current status is already 'documented'", async () => {
    mockFrom.mockImplementation(
      makeReadAndUpdateChain({
        cur: { id: TRA_ID, status: "documented", submitted_at: null },
        next: { id: TRA_ID, status: "documented" },
      }),
    );
    const result = await markTraDocumented(TRA_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_TRANSITION");
  });

  it("markTraComplete rejects when current status is 'draft'", async () => {
    mockFrom.mockImplementation(
      makeReadAndUpdateChain({
        cur: { id: TRA_ID, status: "draft", submitted_at: null },
        next: { id: TRA_ID, status: "completed" },
      }),
    );
    const result = await markTraComplete(TRA_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_TRANSITION");
  });

  it("markTraDocumented succeeds from draft", async () => {
    mockFrom.mockImplementation(
      makeReadAndUpdateChain({
        cur: { id: TRA_ID, status: "draft", submitted_at: null },
        next: { id: TRA_ID, status: "documented" },
      }),
    );
    const result = await markTraDocumented(TRA_ID);
    expect(result.ok).toBe(true);
  });

  it("cancelTra succeeds from documented", async () => {
    mockFrom.mockImplementation(
      makeReadAndUpdateChain({
        cur: { id: TRA_ID, status: "documented", submitted_at: null },
        next: { id: TRA_ID, status: "cancelled" },
      }),
    );
    const result = await cancelTra(TRA_ID);
    expect(result.ok).toBe(true);
  });

  it("returns NOT_FOUND when the TRA doesn't exist", async () => {
    mockFrom.mockImplementation(
      makeReadAndUpdateChain({
        cur: null,
        next: { id: TRA_ID, status: "documented" },
      }),
    );
    const result = await markTraDocumented(TRA_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });
});

describe("computeDeliverableEstimatedHours (DOD: estimates compute correctly)", () => {
  it("Instructor-Led Training: 1 hr seat time × 43 ratio × 1 × 1.0 = 43 hrs", () => {
    expect(
      computeDeliverableEstimatedHours({
        seat_time_hours: 1,
        dev_to_seat_ratio: 43,
        quantity: 1,
        complexity_multiplier: 1.0,
      }),
    ).toBe(43);
  });

  it("Self-Paced eLearning Level 2: 2 hr × 184 × 3 × 1.5 = 1656 hrs", () => {
    expect(
      computeDeliverableEstimatedHours({
        seat_time_hours: 2,
        dev_to_seat_ratio: 184,
        quantity: 3,
        complexity_multiplier: 1.5,
      }),
    ).toBe(1656);
  });

  it("Job Aid: 0.5 hr × 12 × 4 × 0.75 = 18 hrs", () => {
    expect(
      computeDeliverableEstimatedHours({
        seat_time_hours: 0.5,
        dev_to_seat_ratio: 12,
        quantity: 4,
        complexity_multiplier: 0.75,
      }),
    ).toBe(18);
  });

  it("returns 0 when seat_time_hours is 0", () => {
    expect(
      computeDeliverableEstimatedHours({
        seat_time_hours: 0,
        dev_to_seat_ratio: 100,
        quantity: 5,
        complexity_multiplier: 2,
      }),
    ).toBe(0);
  });
});

describe("traPriorityToProjectPriority", () => {
  it("maps each TRA priority to the right project priority", () => {
    expect(traPriorityToProjectPriority("nice_to_have")).toBe("low");
    expect(traPriorityToProjectPriority("important")).toBe("medium");
    expect(traPriorityToProjectPriority("regulatory")).toBe("high");
    expect(traPriorityToProjectPriority(null)).toBe("medium");
  });
});
