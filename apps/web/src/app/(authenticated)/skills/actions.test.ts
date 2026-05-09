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

const mockGetCurrentDepartmentId = vi.fn();
vi.mock("@/lib/auth/current-department", () => ({
  getCurrentDepartmentId: mockGetCurrentDepartmentId,
}));

const { createSkill, archiveSkill, addInstructorSkill, addClassSkillRequirement } =
  await import("./actions");

const ORG_ID = "aaaaaaaa-0000-0000-0000-000000000000";
const SKILL_ID = "bbbbbbbb-0000-0000-0000-000000000000";
const INSTRUCTOR_ID = "cccccccc-0000-0000-0000-000000000000";
const CLASS_ID = "dddddddd-0000-0000-0000-000000000000";

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

describe("createSkill", () => {
  it("rejects when name is empty", async () => {
    const result = await createSkill({ name: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  it("succeeds with a valid skill", async () => {
    const row = {
      id: SKILL_ID,
      org_id: ORG_ID,
      name: "ACLS",
      is_certification: true,
      certifying_authority: "AHA",
    };
    mockFrom.mockReturnValue(makeInsertChain({ data: row, error: null }));

    const result = await createSkill({
      name: "ACLS",
      is_certification: true,
      certifying_authority: "AHA",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.id).toBe(SKILL_ID);
  });

  it("returns friendly message on duplicate name (23505)", async () => {
    mockFrom.mockReturnValue(
      makeInsertChain({
        data: null,
        error: { code: "23505", message: "duplicate key value" },
      }),
    );

    const result = await createSkill({ name: "ACLS" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain("already exists");
  });

  it("returns NO_ORG when org context is missing", async () => {
    mockGetCurrentOrgId.mockResolvedValue(null);
    const result = await createSkill({ name: "ACLS" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NO_ORG");
  });
});

describe("archiveSkill", () => {
  it("flips is_archived to true without deleting the row", async () => {
    const updateFn = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });
    mockFrom.mockReturnValue({ update: updateFn });

    const result = await archiveSkill(SKILL_ID);
    expect(result.ok).toBe(true);

    const calls = updateFn.mock.calls as Array<Array<Record<string, unknown>>>;
    expect(calls[0]?.[0]).toEqual({ is_archived: true });
  });
});

describe("addInstructorSkill", () => {
  it("rejects invalid proficiency", async () => {
    const result = await addInstructorSkill(INSTRUCTOR_ID, {
      skill_id: SKILL_ID,
      proficiency: "wizard",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  it("rejects when skill_id is not a UUID", async () => {
    const result = await addInstructorSkill(INSTRUCTOR_ID, {
      skill_id: "not-a-uuid",
      proficiency: "advanced",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION");
      expect(result.error.field).toBe("skill_id");
    }
  });

  it("rejects when certified is true but no certified_at provided", async () => {
    const result = await addInstructorSkill(INSTRUCTOR_ID, {
      skill_id: SKILL_ID,
      proficiency: "advanced",
      is_certified: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe("certified_at");
  });

  it("succeeds with valid input", async () => {
    mockFrom.mockReturnValue(
      makeInsertChain({
        data: { id: "is-1111", instructor_id: INSTRUCTOR_ID, skill_id: SKILL_ID },
        error: null,
      }),
    );

    const result = await addInstructorSkill(INSTRUCTOR_ID, {
      skill_id: SKILL_ID,
      proficiency: "advanced",
    });
    expect(result.ok).toBe(true);
  });

  it("returns friendly message on duplicate (23505)", async () => {
    mockFrom.mockReturnValue(
      makeInsertChain({
        data: null,
        error: { code: "23505", message: "duplicate key" },
      }),
    );

    const result = await addInstructorSkill(INSTRUCTOR_ID, {
      skill_id: SKILL_ID,
      proficiency: "advanced",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain("already has");
  });
});

describe("addClassSkillRequirement", () => {
  it("rejects invalid min_proficiency", async () => {
    const result = await addClassSkillRequirement(CLASS_ID, {
      skill_id: SKILL_ID,
      min_proficiency: "wizard",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  it("rejects invalid requirement value", async () => {
    const result = await addClassSkillRequirement(CLASS_ID, {
      skill_id: SKILL_ID,
      min_proficiency: "advanced",
      requirement: "mandatory",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  it("succeeds with valid input", async () => {
    mockFrom.mockReturnValue(
      makeInsertChain({
        data: { id: "csr-1111", class_id: CLASS_ID, skill_id: SKILL_ID },
        error: null,
      }),
    );

    const result = await addClassSkillRequirement(CLASS_ID, {
      skill_id: SKILL_ID,
      min_proficiency: "intermediate",
      requirement: "required",
    });
    expect(result.ok).toBe(true);
  });

  it("defaults requirement to 'required' when omitted", async () => {
    mockFrom.mockReturnValue(
      makeInsertChain({
        data: { id: "csr-1111", class_id: CLASS_ID, skill_id: SKILL_ID },
        error: null,
      }),
    );

    const result = await addClassSkillRequirement(CLASS_ID, {
      skill_id: SKILL_ID,
      min_proficiency: "advanced",
    });
    expect(result.ok).toBe(true);
  });
});
