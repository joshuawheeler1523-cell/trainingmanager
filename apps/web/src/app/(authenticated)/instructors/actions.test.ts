import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const mockFrom = vi.fn();
const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
      from: mockFrom,
    }),
  ),
}));

const mockGetCurrentOrgId = vi.fn();
vi.mock("@/lib/auth/current-org", () => ({
  getCurrentOrgId: mockGetCurrentOrgId,
}));

const mockGetCurrentDepartmentId = vi.fn();
vi.mock("@/lib/auth/current-department", () => ({
  getCurrentDepartmentId: mockGetCurrentDepartmentId,
}));

const { createInstructor, softDeleteInstructor, bulkSetAnnualHours } = await import("./actions");

const ORG_ID = "org-aaaa-0000-0000-000000000000";
const INSTRUCTOR_ID = "inst-bbbb-0000-0000-000000000000";

function makeChain(result: { data?: unknown; error?: unknown }) {
  const chain = {
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentOrgId.mockResolvedValue(ORG_ID);
  mockGetCurrentDepartmentId.mockResolvedValue("dddddddd-0000-0000-0000-000000000000");
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1111" } } });
});

describe("createInstructor", () => {
  it("rejects when full_name is missing", async () => {
    const result = await createInstructor({ full_name: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  it("rejects when email format is invalid", async () => {
    const result = await createInstructor({
      full_name: "Jane Smith",
      email: "not-an-email",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION");
      expect(result.error.field).toBe("email");
    }
  });

  it("accepts a record with a valid email", async () => {
    const row = {
      id: INSTRUCTOR_ID,
      org_id: ORG_ID,
      full_name: "Jane Smith",
      email: "jane@example.com",
      annual_hours: 1880,
      status: "active",
    };
    mockFrom.mockReturnValue(makeChain({ data: row, error: null }));

    const result = await createInstructor({
      full_name: "Jane Smith",
      email: "jane@example.com",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.id).toBe(INSTRUCTOR_ID);
  });

  it("accepts a record without an email", async () => {
    const row = {
      id: INSTRUCTOR_ID,
      org_id: ORG_ID,
      full_name: "No Email",
      email: null,
      annual_hours: 1880,
      status: "active",
    };
    mockFrom.mockReturnValue(makeChain({ data: row, error: null }));

    const result = await createInstructor({ full_name: "No Email" });
    expect(result.ok).toBe(true);
  });

  it("rejects when annual_hours exceeds 4000", async () => {
    const result = await createInstructor({ full_name: "Test", annual_hours: 5000 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  // Regression: zodResolver on the client transforms "" â†’ null on optional string fields,
  // then this server action re-parses the same payload. Schema must accept null on the
  // second parse.
  it("accepts null for all optional string fields (idempotent re-parse)", async () => {
    const row = {
      id: INSTRUCTOR_ID,
      org_id: ORG_ID,
      full_name: "Null Tester",
      annual_hours: 1880,
      status: "active",
    };
    mockFrom.mockReturnValue(makeChain({ data: row, error: null }));

    const result = await createInstructor({
      full_name: "Null Tester",
      email: null,
      phone: null,
      department: null,
      location: null,
      job_title: null,
      start_date: null,
      notes: null,
    });
    expect(result.ok).toBe(true);
  });

  it("returns NO_ORG error when org context is missing", async () => {
    mockGetCurrentOrgId.mockResolvedValue(null);
    const result = await createInstructor({ full_name: "Test" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NO_ORG");
  });
});

describe("softDeleteInstructor", () => {
  it("sets deleted_at but does not delete the row", async () => {
    const updateFn = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    });
    mockFrom.mockReturnValue({ update: updateFn });

    const result = await softDeleteInstructor(INSTRUCTOR_ID);
    expect(result.ok).toBe(true);

    // Verify update (not delete) was called, with a deleted_at timestamp
    const calls = updateFn.mock.calls as Array<Array<Record<string, unknown>>>;
    const firstArg = calls[0]?.[0] ?? {};
    expect(typeof firstArg["deleted_at"]).toBe("string");
  });

  it("returns NO_ORG error when org context is missing", async () => {
    mockGetCurrentOrgId.mockResolvedValue(null);
    const result = await softDeleteInstructor(INSTRUCTOR_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NO_ORG");
  });
});

describe("bulkSetAnnualHours", () => {
  function makeBulkChain(rows: { id: string }[]) {
    return {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: rows, error: null }),
    };
  }

  it("rejects negative values", async () => {
    const result = await bulkSetAnnualHours({ annual_hours: -1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  it("rejects values above 4000", async () => {
    const result = await bulkSetAnnualHours({ annual_hours: 5000 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  it("rejects non-integer values", async () => {
    const result = await bulkSetAnnualHours({ annual_hours: 1880.5 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  it("updates every non-archived instructor in the org and returns count", async () => {
    const chain = makeBulkChain([{ id: "1" }, { id: "2" }, { id: "3" }]);
    mockFrom.mockReturnValue(chain);

    const result = await bulkSetAnnualHours({ annual_hours: 2000 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.updated).toBe(3);

    expect(chain.update).toHaveBeenCalledWith({ annual_hours: 2000 });
    expect(chain.eq).toHaveBeenCalledWith("org_id", ORG_ID);
    expect(chain.is).toHaveBeenCalledWith("deleted_at", null);
  });

  it("returns NO_ORG when org context is missing", async () => {
    mockGetCurrentOrgId.mockResolvedValue(null);
    const result = await bulkSetAnnualHours({ annual_hours: 1880 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NO_ORG");
  });
});
