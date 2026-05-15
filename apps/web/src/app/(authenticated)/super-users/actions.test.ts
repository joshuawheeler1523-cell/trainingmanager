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

const { createSuperUser, updateSuperUser, softDeleteSuperUser, markSuperUserTrained } =
  await import("./actions");

const ORG_ID = "org-aaaa-0000-0000-000000000000";
const DEPT_ID = "dept-bbbb-0000-0000-000000000000";
const SU_ID = "su-cccc-0000-0000-000000000000";
const CLASS_ID = "11111111-1111-1111-1111-111111111111";

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
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
});

describe("createSuperUser", () => {
  it("rejects when full_name is empty", async () => {
    const result = await createSuperUser({ full_name: "", topic: "X" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  it("rejects when both class_id and topic are missing", async () => {
    const result = await createSuperUser({ full_name: "Jane Doe" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  it("accepts a record with only topic (ad-hoc)", async () => {
    const row = {
      id: SU_ID,
      org_id: ORG_ID,
      department_id: DEPT_ID,
      full_name: "Jane Doe",
      topic: "Glucometer",
    };
    mockFrom.mockReturnValue(makeChain({ data: row, error: null }));

    const result = await createSuperUser({ full_name: "Jane Doe", topic: "Glucometer" });
    expect(result.ok).toBe(true);
  });

  it("accepts a record with only class_id (class-linked)", async () => {
    const row = {
      id: SU_ID,
      org_id: ORG_ID,
      department_id: DEPT_ID,
      full_name: "Jane Doe",
      class_id: CLASS_ID,
    };
    mockFrom.mockReturnValue(makeChain({ data: row, error: null }));

    const result = await createSuperUser({ full_name: "Jane Doe", class_id: CLASS_ID });
    expect(result.ok).toBe(true);
  });

  it("returns NO_ORG when org context is missing", async () => {
    mockGetCurrentOrgId.mockResolvedValue(null);
    const result = await createSuperUser({ full_name: "Jane Doe", topic: "X" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NO_ORG");
  });

  it("returns NO_DEPARTMENT when department context is missing", async () => {
    mockGetCurrentDepartmentId.mockResolvedValue(null);
    const result = await createSuperUser({ full_name: "Jane Doe", topic: "X" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NO_DEPARTMENT");
  });
});

describe("updateSuperUser", () => {
  it("updates a record with a partial payload", async () => {
    const row = {
      id: SU_ID,
      org_id: ORG_ID,
      department_id: DEPT_ID,
      full_name: "Jane Updated",
      topic: "Glucometer",
      class_id: null,
    };
    mockFrom.mockReturnValue(makeChain({ data: row, error: null }));

    const result = await updateSuperUser(SU_ID, { full_name: "Jane Updated" });
    expect(result.ok).toBe(true);
  });

  it("rejects when clearing both class_id and topic", async () => {
    const result = await updateSuperUser(SU_ID, { class_id: null, topic: null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });
});

describe("softDeleteSuperUser", () => {
  it("sets deleted_at without hard-deleting", async () => {
    const chain = makeChain({ data: { class_id: null }, error: null });
    mockFrom.mockReturnValue(chain);

    const result = await softDeleteSuperUser(SU_ID);
    expect(result.ok).toBe(true);

    const updateArg = chain.update.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(typeof updateArg?.["deleted_at"]).toBe("string");
  });
});

describe("markSuperUserTrained", () => {
  it("sets trained_at to today when trained=true", async () => {
    const chain = makeChain({
      data: { id: SU_ID, trained_at: "2026-05-15", class_id: null },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const result = await markSuperUserTrained(SU_ID, true);
    expect(result.ok).toBe(true);

    const updateArg = chain.update.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(updateArg?.["trained_at"]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("sets trained_at to null when trained=false", async () => {
    const chain = makeChain({
      data: { id: SU_ID, trained_at: null, class_id: null },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const result = await markSuperUserTrained(SU_ID, false);
    expect(result.ok).toBe(true);

    const updateArg = chain.update.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(updateArg?.["trained_at"]).toBeNull();
  });
});
