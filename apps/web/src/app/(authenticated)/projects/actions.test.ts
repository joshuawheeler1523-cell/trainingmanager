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

const {
  createProject,
  updateProject,
  addTeamMember,
  createTask,
  assignTaskMember,
  createActionItem,
  updateActionItem,
} = await import("./actions");

const ORG_ID = "aaaaaaaa-0000-0000-0000-000000000000";
const PROJECT_ID = "bbbbbbbb-0000-0000-0000-000000000000";
const TASK_ID = "cccccccc-0000-0000-0000-000000000000";
const INSTRUCTOR_ID = "dddddddd-0000-0000-0000-000000000000";
const MEMBER_ID = "eeeeeeee-0000-0000-0000-000000000000";

function makeInsertChain(result: { data?: unknown; error?: unknown }) {
  return {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
  };
}

function makeUpdateChain(result: { data?: unknown; error?: unknown }) {
  return {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
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

describe("createProject", () => {
  it("rejects an empty name", async () => {
    const result = await createProject({ name: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  it("rejects an unknown status", async () => {
    const result = await createProject({ name: "Q1 onboarding", status: "wat" });
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown priority", async () => {
    const result = await createProject({ name: "Q1 onboarding", priority: "extreme" });
    expect(result.ok).toBe(false);
  });

  it("succeeds with a minimal record", async () => {
    mockFrom.mockReturnValue(
      makeInsertChain({
        data: { id: PROJECT_ID, org_id: ORG_ID, name: "Q1 onboarding", status: "planning" },
        error: null,
      }),
    );
    const result = await createProject({ name: "Q1 onboarding" });
    expect(result.ok).toBe(true);
  });

  it("returns NO_ORG when org context missing", async () => {
    mockGetCurrentOrgId.mockResolvedValue(null);
    const result = await createProject({ name: "Q1 onboarding" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NO_ORG");
  });
});

describe("updateProject", () => {
  it("succeeds with a partial update", async () => {
    mockFrom.mockReturnValue(
      makeUpdateChain({
        data: { id: PROJECT_ID, status: "active" },
        error: null,
      }),
    );
    const result = await updateProject(PROJECT_ID, { status: "active" });
    expect(result.ok).toBe(true);
  });

  it("rejects an unknown status on update", async () => {
    const result = await updateProject(PROJECT_ID, { status: "wat" });
    expect(result.ok).toBe(false);
  });
});

describe("addTeamMember", () => {
  it("rejects a non-uuid instructor_id", async () => {
    const result = await addTeamMember(PROJECT_ID, {
      instructor_id: "not-a-uuid",
      role: "member",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown role", async () => {
    const result = await addTeamMember(PROJECT_ID, {
      instructor_id: INSTRUCTOR_ID,
      role: "boss",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects negative allocated_hours", async () => {
    const result = await addTeamMember(PROJECT_ID, {
      instructor_id: INSTRUCTOR_ID,
      allocated_hours: -5,
    });
    expect(result.ok).toBe(false);
  });

  it("succeeds with a valid member", async () => {
    mockFrom.mockReturnValue(
      makeInsertChain({
        data: { id: MEMBER_ID, instructor_id: INSTRUCTOR_ID, role: "member" },
        error: null,
      }),
    );
    const result = await addTeamMember(PROJECT_ID, {
      instructor_id: INSTRUCTOR_ID,
      role: "member",
      allocated_hours: 40,
    });
    expect(result.ok).toBe(true);
  });
});

describe("createTask", () => {
  it("rejects an empty name", async () => {
    const result = await createTask(PROJECT_ID, { name: "" });
    expect(result.ok).toBe(false);
  });

  it("rejects percent_complete > 100", async () => {
    const result = await createTask(PROJECT_ID, { name: "X", percent_complete: 150 });
    expect(result.ok).toBe(false);
  });

  it("succeeds with a minimal record", async () => {
    mockFrom.mockReturnValue(
      makeInsertChain({
        data: { id: TASK_ID, name: "Build slides", status: "not_started", percent_complete: 0 },
        error: null,
      }),
    );
    const result = await createTask(PROJECT_ID, { name: "Build slides" });
    expect(result.ok).toBe(true);
  });
});

describe("assignTaskMember", () => {
  it("rejects a non-uuid project_team_member_id", async () => {
    const result = await assignTaskMember(TASK_ID, PROJECT_ID, {
      project_team_member_id: "not-a-uuid",
      allocated_hours: 4,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects negative allocated_hours", async () => {
    const result = await assignTaskMember(TASK_ID, PROJECT_ID, {
      project_team_member_id: MEMBER_ID,
      allocated_hours: -1,
    });
    expect(result.ok).toBe(false);
  });

  it("upserts a valid assignment", async () => {
    mockFrom.mockReturnValue(
      makeUpsertChain({
        data: {
          id: "ta-1",
          task_id: TASK_ID,
          project_team_member_id: MEMBER_ID,
          allocated_hours: 4,
        },
        error: null,
      }),
    );
    const result = await assignTaskMember(TASK_ID, PROJECT_ID, {
      project_team_member_id: MEMBER_ID,
      allocated_hours: 4,
    });
    expect(result.ok).toBe(true);
  });
});

describe("createActionItem", () => {
  it("rejects an empty description", async () => {
    const result = await createActionItem(TASK_ID, PROJECT_ID, { description: "" });
    expect(result.ok).toBe(false);
  });

  it("succeeds with a minimal record", async () => {
    mockFrom.mockReturnValue(
      makeInsertChain({
        data: { id: "ai-1", description: "Send invites", is_complete: false },
        error: null,
      }),
    );
    const result = await createActionItem(TASK_ID, PROJECT_ID, { description: "Send invites" });
    expect(result.ok).toBe(true);
  });
});

describe("updateActionItem", () => {
  it("can toggle is_complete", async () => {
    mockFrom.mockReturnValue(
      makeUpdateChain({
        data: { id: "ai-1", is_complete: true },
        error: null,
      }),
    );
    const result = await updateActionItem("ai-1", PROJECT_ID, { is_complete: true });
    expect(result.ok).toBe(true);
  });
});

describe("projectPercentComplete + effectiveTaskPercent (pure helpers)", () => {
  it("returns null when no tasks", async () => {
    const { projectPercentComplete } = await import("@arbor/shared");
    expect(projectPercentComplete([])).toBe(null);
  });

  it("averages task percent_complete values", async () => {
    const { projectPercentComplete } = await import("@arbor/shared");
    expect(
      projectPercentComplete([
        { percent_complete: 0 },
        { percent_complete: 50 },
        { percent_complete: 100 },
      ]),
    ).toBe(50);
  });

  it("rounds to nearest integer", async () => {
    const { projectPercentComplete } = await import("@arbor/shared");
    expect(projectPercentComplete([{ percent_complete: 33 }, { percent_complete: 33 }])).toBe(33);
  });

  it("treats completed tasks as 100% regardless of percent_complete value", async () => {
    const { effectiveTaskPercent } = await import("@arbor/shared");
    expect(effectiveTaskPercent({ status: "completed", percent_complete: 0 })).toBe(100);
    expect(effectiveTaskPercent({ status: "in_progress", percent_complete: 60 })).toBe(60);
  });
});
