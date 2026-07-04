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

const mockIsManager = vi.fn();
vi.mock("@/lib/auth/role", () => ({
  isManager: mockIsManager,
}));

const { createTask, deleteTask, upsertProgress } = await import("./actions");

const ORG_ID = "aaaaaaaa-0000-0000-0000-000000000000";
const TASK_ID = "bbbbbbbb-0000-0000-0000-000000000000";
const INSTRUCTOR_ID = "cccccccc-0000-0000-0000-000000000000";

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
  mockIsManager.mockResolvedValue(true);
});

describe("createTask", () => {
  it("rejects an empty name", async () => {
    const result = await createTask({ name: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  it("returns NO_ORG when org context is missing", async () => {
    mockGetCurrentOrgId.mockResolvedValue(null);
    const result = await createTask({ name: "Sign contract", sort_order: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NO_ORG");
  });

  it("returns FORBIDDEN when the caller is not a manager", async () => {
    mockIsManager.mockResolvedValue(false);
    const result = await createTask({ name: "Sign contract", sort_order: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("inserts a task when sort_order is provided", async () => {
    const row = { id: TASK_ID, org_id: ORG_ID, name: "Sign contract", sort_order: 0 };
    mockFrom.mockReturnValue(makeInsertChain({ data: row, error: null }));

    const result = await createTask({ name: "Sign contract", sort_order: 0 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.id).toBe(TASK_ID);
  });
});

describe("deleteTask", () => {
  it("soft-deletes by setting deleted_at, not removing the row", async () => {
    const updateFn = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });
    mockFrom.mockReturnValue({ update: updateFn });

    const result = await deleteTask(TASK_ID);
    expect(result.ok).toBe(true);

    const calls = updateFn.mock.calls as Array<Array<Record<string, unknown>>>;
    expect(calls[0]?.[0]).toHaveProperty("deleted_at");
  });
});

describe("upsertProgress", () => {
  it("rejects a non-uuid instructor_id", async () => {
    const result = await upsertProgress({
      instructor_id: "not-a-uuid",
      task_id: TASK_ID,
      status: "done",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  it("deletes the cell when reset to not_started with no date/notes", async () => {
    const eq3 = vi.fn().mockResolvedValue({ error: null });
    const eq2 = vi.fn().mockReturnValue({ eq: eq3 });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const deleteFn = vi.fn().mockReturnValue({ eq: eq1 });
    mockFrom.mockReturnValue({ delete: deleteFn });

    const result = await upsertProgress({
      instructor_id: INSTRUCTOR_ID,
      task_id: TASK_ID,
      status: "not_started",
      completed_at: "",
      notes: "",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ id: null });
    expect(deleteFn).toHaveBeenCalled();
  });

  it("upserts the cell when a real status is set", async () => {
    const row = {
      id: "dddddddd-0000-0000-0000-000000000000",
      instructor_id: INSTRUCTOR_ID,
      task_id: TASK_ID,
      status: "done",
    };
    const upsertChain = {
      upsert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: row, error: null }),
    };
    mockFrom.mockReturnValue(upsertChain);

    const result = await upsertProgress({
      instructor_id: INSTRUCTOR_ID,
      task_id: TASK_ID,
      status: "done",
      completed_at: "2026-06-27",
    });
    expect(result.ok).toBe(true);
    expect(upsertChain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: "done", completed_at: "2026-06-27" }),
      { onConflict: "instructor_id,task_id" },
    );
  });
});
