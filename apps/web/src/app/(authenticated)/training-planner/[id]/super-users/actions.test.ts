import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
      from: mockFrom,
    }),
  ),
}));

const mockGetCurrentOrgId = vi.fn();
vi.mock("@/lib/auth/current-org", () => ({ getCurrentOrgId: mockGetCurrentOrgId }));

const mockGetCurrentDepartmentId = vi.fn();
vi.mock("@/lib/auth/current-department", () => ({
  getCurrentDepartmentId: mockGetCurrentDepartmentId,
}));

const {
  createImplSuperUser,
  updateImplSuperUser,
  softDeleteImplSuperUser,
  markImplSuperUserTrained,
} = await import("./actions");

const ORG_ID = "org-aaaa-0000-0000-000000000000";
const DEPT_ID = "dept-bbbb-0000-0000-000000000000";
const IMPL_ID = "11111111-1111-1111-1111-111111111111";
const SU_ID = "su-cccc-0000-0000-000000000000";
const IMPL_CLASS_ID = "22222222-2222-2222-2222-222222222222";

function makeChain(result: { data?: unknown; error?: unknown }) {
  return {
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentOrgId.mockResolvedValue(ORG_ID);
  mockGetCurrentDepartmentId.mockResolvedValue(DEPT_ID);
});

describe("createImplSuperUser", () => {
  it("rejects when full_name is empty", async () => {
    const result = await createImplSuperUser(IMPL_ID, { full_name: "", topic: "X" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  it("rejects when neither impl_class_id nor topic is set", async () => {
    const result = await createImplSuperUser(IMPL_ID, { full_name: "Jane" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  it("accepts a record with only topic", async () => {
    const row = {
      id: SU_ID,
      org_id: ORG_ID,
      department_id: DEPT_ID,
      implementation_id: IMPL_ID,
      full_name: "Jane",
      topic: "Glucometer",
    };
    mockFrom.mockReturnValue(makeChain({ data: row, error: null }));

    const result = await createImplSuperUser(IMPL_ID, { full_name: "Jane", topic: "Glucometer" });
    expect(result.ok).toBe(true);
  });

  it("accepts a record with only impl_class_id", async () => {
    const row = {
      id: SU_ID,
      org_id: ORG_ID,
      department_id: DEPT_ID,
      implementation_id: IMPL_ID,
      full_name: "Jane",
      impl_class_id: IMPL_CLASS_ID,
    };
    mockFrom.mockReturnValue(makeChain({ data: row, error: null }));

    const result = await createImplSuperUser(IMPL_ID, {
      full_name: "Jane",
      impl_class_id: IMPL_CLASS_ID,
    });
    expect(result.ok).toBe(true);
  });

  it("returns NO_ORG when org context is missing", async () => {
    mockGetCurrentOrgId.mockResolvedValue(null);
    const result = await createImplSuperUser(IMPL_ID, { full_name: "Jane", topic: "X" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NO_ORG");
  });
});

describe("updateImplSuperUser", () => {
  it("updates a record", async () => {
    const row = {
      id: SU_ID,
      org_id: ORG_ID,
      department_id: DEPT_ID,
      implementation_id: IMPL_ID,
      full_name: "Jane Updated",
      topic: "X",
    };
    mockFrom.mockReturnValue(makeChain({ data: row, error: null }));

    const result = await updateImplSuperUser(SU_ID, { full_name: "Jane Updated" });
    expect(result.ok).toBe(true);
  });

  it("rejects clearing both class and topic", async () => {
    const result = await updateImplSuperUser(SU_ID, { impl_class_id: null, topic: null });
    expect(result.ok).toBe(false);
  });
});

describe("softDeleteImplSuperUser", () => {
  it("sets deleted_at", async () => {
    const chain = makeChain({ data: { implementation_id: IMPL_ID }, error: null });
    mockFrom.mockReturnValue(chain);
    const result = await softDeleteImplSuperUser(SU_ID);
    expect(result.ok).toBe(true);
    const arg = chain.update.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(typeof arg?.["deleted_at"]).toBe("string");
  });
});

describe("markImplSuperUserTrained", () => {
  it("sets trained_at to today when true", async () => {
    const chain = makeChain({
      data: { id: SU_ID, trained_at: "2026-05-15", implementation_id: IMPL_ID },
      error: null,
    });
    mockFrom.mockReturnValue(chain);
    const result = await markImplSuperUserTrained(SU_ID, true);
    expect(result.ok).toBe(true);
    const arg = chain.update.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(arg?.["trained_at"]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("sets trained_at to null when false", async () => {
    const chain = makeChain({
      data: { id: SU_ID, trained_at: null, implementation_id: IMPL_ID },
      error: null,
    });
    mockFrom.mockReturnValue(chain);
    const result = await markImplSuperUserTrained(SU_ID, false);
    expect(result.ok).toBe(true);
    const arg = chain.update.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(arg?.["trained_at"]).toBeNull();
  });
});
