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

const { createRequest, updateRequestStatus, assignRequestInstructor, createIntakeLink } =
  await import("./actions");

const ORG_ID = "aaaaaaaa-0000-0000-0000-000000000000";
const REQUEST_ID = "bbbbbbbb-0000-0000-0000-000000000000";
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
  mockGetCurrentDepartmentId.mockResolvedValue("dddddddd-0000-0000-0000-000000000000");
});

describe("createRequest", () => {
  it("rejects when title is empty", async () => {
    const result = await createRequest({ title: "", requested_by_name: "Sam" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  it("rejects when requested_by_name is empty", async () => {
    const result = await createRequest({ title: "Need ACLS", requested_by_name: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe("requested_by_name");
  });

  it("rejects an invalid email", async () => {
    const result = await createRequest({
      title: "X",
      requested_by_name: "Sam",
      requested_by_email: "not-an-email",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe("requested_by_email");
  });

  it("rejects an unknown urgency", async () => {
    const result = await createRequest({
      title: "X",
      requested_by_name: "Sam",
      urgency: "later",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  it("succeeds with a minimal valid record", async () => {
    mockFrom.mockReturnValue(
      makeInsertChain({
        data: { id: REQUEST_ID, org_id: ORG_ID, title: "X", status: "new" },
        error: null,
      }),
    );
    const result = await createRequest({ title: "X", requested_by_name: "Sam" });
    expect(result.ok).toBe(true);
  });

  it("returns NO_ORG when org context missing", async () => {
    mockGetCurrentOrgId.mockResolvedValue(null);
    const result = await createRequest({ title: "X", requested_by_name: "Sam" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NO_ORG");
  });
});

describe("updateRequestStatus", () => {
  it("rejects an unknown status", async () => {
    const result = await updateRequestStatus(REQUEST_ID, { status: "wat" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  it("succeeds when transitioning to a valid status", async () => {
    mockFrom.mockReturnValue({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: REQUEST_ID, status: "approved" },
        error: null,
      }),
    });
    const result = await updateRequestStatus(REQUEST_ID, { status: "approved" });
    expect(result.ok).toBe(true);
  });
});

describe("assignRequestInstructor", () => {
  it("rejects a non-uuid instructor_id", async () => {
    const result = await assignRequestInstructor(REQUEST_ID, {
      instructor_id: "not-a-uuid",
      estimated_hours: 4,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  it("rejects negative estimated_hours", async () => {
    const result = await assignRequestInstructor(REQUEST_ID, {
      instructor_id: INSTRUCTOR_ID,
      estimated_hours: -1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  it("upserts a valid assignment", async () => {
    mockFrom.mockReturnValue(
      makeUpsertChain({
        data: {
          id: "era-1",
          request_id: REQUEST_ID,
          instructor_id: INSTRUCTOR_ID,
          estimated_hours: 4,
        },
        error: null,
      }),
    );
    const result = await assignRequestInstructor(REQUEST_ID, {
      instructor_id: INSTRUCTOR_ID,
      estimated_hours: 4,
    });
    expect(result.ok).toBe(true);
  });
});

describe("createIntakeLink", () => {
  it("succeeds with valid input", async () => {
    mockFrom.mockReturnValue(
      makeInsertChain({
        data: {
          id: "link-1",
          org_id: ORG_ID,
          token: "00000000-0000-0000-0000-000000000000",
          is_active: true,
        },
        error: null,
      }),
    );
    const result = await createIntakeLink({ label: "All staff", expires_at: null });
    expect(result.ok).toBe(true);
  });

  it("returns NO_ORG when org context missing", async () => {
    mockGetCurrentOrgId.mockResolvedValue(null);
    const result = await createIntakeLink({ label: null, expires_at: null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NO_ORG");
  });
});

describe("publicSubmitSchema (anonymous form)", () => {
  // Lightweight import test â€” the actual public submission uses an
  // unauthenticated Supabase client which we don't mock here.
  it("requires name + email + title", async () => {
    const { publicSubmitSchema } = await import("@arbor/shared");
    const result = publicSubmitSchema.safeParse({ title: "", requested_by_name: "" });
    expect(result.success).toBe(false);
  });

  it("accepts a complete public submission", async () => {
    const { publicSubmitSchema } = await import("@arbor/shared");
    const result = publicSubmitSchema.safeParse({
      title: "Need EMR refresher",
      requested_by_name: "Jane Smith",
      requested_by_email: "jane@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email", async () => {
    const { publicSubmitSchema } = await import("@arbor/shared");
    const result = publicSubmitSchema.safeParse({
      title: "X",
      requested_by_name: "Jane",
      requested_by_email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });
});
