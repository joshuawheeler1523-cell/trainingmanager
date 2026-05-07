import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      from: mockFrom,
    }),
  ),
}));

const mockGetCurrentOrgId = vi.fn();
vi.mock("@/lib/auth/current-org", () => ({
  getCurrentOrgId: mockGetCurrentOrgId,
}));

const { createClass, softDeleteClass, assignInstructorToClass } = await import("./actions");

const ORG_ID = "aaaaaaaa-0000-0000-0000-000000000000";
const CLASS_ID = "bbbbbbbb-0000-0000-0000-000000000000";
const INSTRUCTOR_ID = "cccccccc-0000-0000-0000-000000000000";

function makeInsertChain(result: { data?: unknown; error?: unknown }) {
  return {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
  };
}

function makeUpsertChain(result: { data?: unknown; error?: unknown }) {
  return {
    upsert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentOrgId.mockResolvedValue(ORG_ID);
});

describe("createClass", () => {
  it("rejects when name is empty", async () => {
    const result = await createClass({ name: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  it("rejects multi-day class with fewer than 2 days", async () => {
    const result = await createClass({ name: "BLS", is_multi_day: true, total_days: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION");
      expect(result.error.field).toBe("total_days");
    }
  });

  it("rejects when custom_day_hours length does not match total_days", async () => {
    const result = await createClass({
      name: "BLS",
      is_multi_day: true,
      total_days: 3,
      custom_day_hours: [8, 8],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION");
      expect(result.error.field).toBe("custom_day_hours");
    }
  });

  it("succeeds with a valid single-day class", async () => {
    const row = {
      id: CLASS_ID,
      org_id: ORG_ID,
      name: "BLS Certification",
      status: "active",
      is_multi_day: false,
      total_days: 1,
    };
    mockFrom.mockReturnValue(makeInsertChain({ data: row, error: null }));

    const result = await createClass({ name: "BLS Certification" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.id).toBe(CLASS_ID);
  });

  it("succeeds with a valid multi-day class", async () => {
    const row = {
      id: CLASS_ID,
      org_id: ORG_ID,
      name: "Advanced Training",
      status: "active",
      is_multi_day: true,
      total_days: 3,
    };
    mockFrom.mockReturnValue(makeInsertChain({ data: row, error: null }));

    const result = await createClass({
      name: "Advanced Training",
      is_multi_day: true,
      total_days: 3,
      hours_per_day: 8,
    });
    expect(result.ok).toBe(true);
  });

  it("returns NO_ORG error when org context is missing", async () => {
    mockGetCurrentOrgId.mockResolvedValue(null);
    const result = await createClass({ name: "Test" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NO_ORG");
  });

  // Regression: zodResolver on the client normalizes "" → null on optional fields,
  // then this server action re-parses the same payload. Schema must accept null.
  it("accepts null for all optional fields (idempotent re-parse)", async () => {
    const row = {
      id: CLASS_ID,
      org_id: ORG_ID,
      name: "Null Tester",
      status: "active",
      is_multi_day: false,
      total_days: 1,
    };
    mockFrom.mockReturnValue(makeInsertChain({ data: row, error: null }));

    const result = await createClass({
      name: "Null Tester",
      description: null,
      allocation_bucket_id: null,
      hours_per_day: null,
      custom_day_hours: null,
    });
    expect(result.ok).toBe(true);
  });
});

describe("softDeleteClass", () => {
  it("sets deleted_at but does not hard-delete the row", async () => {
    const updateFn = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    });
    mockFrom.mockReturnValue({ update: updateFn });

    const result = await softDeleteClass(CLASS_ID);
    expect(result.ok).toBe(true);

    const calls = updateFn.mock.calls as Array<Array<Record<string, unknown>>>;
    const firstArg = calls[0]?.[0] ?? {};
    expect(typeof firstArg["deleted_at"]).toBe("string");
  });

  it("returns NO_ORG error when org context is missing", async () => {
    mockGetCurrentOrgId.mockResolvedValue(null);
    const result = await softDeleteClass(CLASS_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NO_ORG");
  });
});

describe("assignInstructorToClass", () => {
  it("succeeds with valid input", async () => {
    mockFrom.mockReturnValue(makeUpsertChain({ data: { id: "cia-1111" }, error: null }));

    const result = await assignInstructorToClass(CLASS_ID, {
      instructor_id: INSTRUCTOR_ID,
      role: "primary",
      assigned_offerings: 2,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.id).toBe("cia-1111");
  });

  it("returns friendly message on check_violation (23514)", async () => {
    mockFrom.mockReturnValue(
      makeUpsertChain({
        data: null,
        error: { code: "23514", message: "check_violation" },
      }),
    );

    const result = await assignInstructorToClass(CLASS_ID, {
      instructor_id: INSTRUCTOR_ID,
      assigned_offerings: 99,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain("exceed");
  });

  it("rejects when instructor_id is not a UUID", async () => {
    const result = await assignInstructorToClass(CLASS_ID, {
      instructor_id: "not-a-uuid",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });
});
