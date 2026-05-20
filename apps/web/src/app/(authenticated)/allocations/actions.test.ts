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

vi.mock("@/lib/auth/role", () => ({
  getCurrentRole: vi.fn(() => Promise.resolve("manager")),
  isManager: vi.fn(() => Promise.resolve(true)),
}));

const {
  createBucket,
  reorderBuckets,
  saveGlobalAllocations,
  createGroup,
  saveIndividualAllocations,
} = await import("./actions");
const { sumSlate } = await import("@arbor/shared");

const ORG_ID = "aaaaaaaa-0000-0000-0000-000000000000";
const BUCKET_ID = "bbbbbbbb-0000-0000-0000-000000000000";
const BUCKET_ID_2 = "cccccccc-0000-0000-0000-000000000000";
const GROUP_ID = "dddddddd-0000-0000-0000-000000000000";
const INSTRUCTOR_ID = "eeeeeeee-0000-0000-0000-000000000000";

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

describe("createBucket", () => {
  it("rejects when name is empty", async () => {
    const result = await createBucket({ name: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  it("rejects an invalid color", async () => {
    const result = await createBucket({ name: "Instruction", color: "bluish" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe("color");
  });

  it("succeeds with valid input", async () => {
    mockFrom.mockReturnValue(
      makeInsertChain({ data: { id: BUCKET_ID, name: "Instruction" }, error: null }),
    );
    const result = await createBucket({ name: "Instruction" });
    expect(result.ok).toBe(true);
  });

  it("returns NO_ORG when org context missing", async () => {
    mockGetCurrentOrgId.mockResolvedValue(null);
    const result = await createBucket({ name: "Instruction" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NO_ORG");
  });

  it("returns friendly message on duplicate name (23505)", async () => {
    mockFrom.mockReturnValue(
      makeInsertChain({ data: null, error: { code: "23505", message: "duplicate key" } }),
    );
    const result = await createBucket({ name: "Instruction" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain("already exists");
  });
});

describe("reorderBuckets", () => {
  it("rejects when payload contains a non-uuid id", async () => {
    const result = await reorderBuckets([{ id: "not-a-uuid", display_order: 0 }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  it("issues an update per row and reports the count", async () => {
    // .eq is called twice (id, org_id); the second one resolves the query
    mockFrom.mockReturnValue({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
    });

    const result = await reorderBuckets([
      { id: BUCKET_ID, display_order: 0 },
      { id: BUCKET_ID_2, display_order: 1 },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.count).toBe(2);
  });
});

describe("saveGlobalAllocations", () => {
  it("rejects target_percent > 100", async () => {
    const result = await saveGlobalAllocations([{ bucket_id: BUCKET_ID, target_percent: 150 }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  it("rejects negative target_percent", async () => {
    const result = await saveGlobalAllocations([{ bucket_id: BUCKET_ID, target_percent: -1 }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  it("returns NO_ORG when org context missing", async () => {
    mockGetCurrentOrgId.mockResolvedValue(null);
    const result = await saveGlobalAllocations([{ bucket_id: BUCKET_ID, target_percent: 50 }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NO_ORG");
  });
});

describe("createGroup", () => {
  it("rejects when name is empty", async () => {
    const result = await createGroup({ name: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  it("succeeds with valid input", async () => {
    mockFrom.mockReturnValue(
      makeInsertChain({
        data: { id: GROUP_ID, name: "Clinical Instructors" },
        error: null,
      }),
    );
    const result = await createGroup({ name: "Clinical Instructors" });
    expect(result.ok).toBe(true);
  });
});

describe("saveIndividualAllocations", () => {
  it("rejects when payload contains a non-uuid bucket_id", async () => {
    const result = await saveIndividualAllocations(INSTRUCTOR_ID, [
      { bucket_id: "not-a-uuid", target_percent: 50 },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  it("returns NO_ORG when org context missing", async () => {
    mockGetCurrentOrgId.mockResolvedValue(null);
    const result = await saveIndividualAllocations(INSTRUCTOR_ID, []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NO_ORG");
  });
});

describe("sumSlate (UI sum-validation helper)", () => {
  it("flags a sum of 99.5% as not-100", () => {
    const r = sumSlate([{ target_percent: 50 }, { target_percent: 49.5 }]);
    expect(r.sum).toBe(99.5);
    expect(r.isHundred).toBe(false);
  });

  it("flags a sum of exactly 100% as 100", () => {
    const r = sumSlate([{ target_percent: 70 }, { target_percent: 30 }]);
    expect(r.sum).toBe(100);
    expect(r.isHundred).toBe(true);
  });

  it("handles fractional rounding so 33.33 + 33.33 + 33.34 reads as 100", () => {
    const r = sumSlate([
      { target_percent: 33.33 },
      { target_percent: 33.33 },
      { target_percent: 33.34 },
    ]);
    expect(r.sum).toBe(100);
    expect(r.isHundred).toBe(true);
  });

  it("returns 0 for an empty slate", () => {
    const r = sumSlate([]);
    expect(r.sum).toBe(0);
    expect(r.isHundred).toBe(false);
  });
});
