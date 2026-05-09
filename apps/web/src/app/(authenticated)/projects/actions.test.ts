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

const {
  createProject,
  updateProject,
  addTeamMember,
  createTask,
  updateTask,
  assignTaskMember,
  createActionItem,
  updateActionItem,
  createMilestone,
  createDependency,
  createExternalDep,
  generateShareToken,
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
  mockGetCurrentDepartmentId.mockResolvedValue("dddddddd-0000-0000-0000-000000000000");
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

describe("updateTask (Gantt drag â†’ date update)", () => {
  it("rejects an invalid percent_complete on update", async () => {
    const result = await updateTask(TASK_ID, PROJECT_ID, { percent_complete: 200 });
    expect(result.ok).toBe(false);
  });

  it("succeeds when persisting drag-shifted dates", async () => {
    mockFrom.mockReturnValue(
      makeUpdateChain({
        data: { id: TASK_ID, start_date: "2026-06-01", end_date: "2026-06-10" },
        error: null,
      }),
    );
    const result = await updateTask(TASK_ID, PROJECT_ID, {
      start_date: "2026-06-01",
      end_date: "2026-06-10",
    });
    expect(result.ok).toBe(true);
  });

  it("succeeds when Kanban moves a card to completed", async () => {
    mockFrom.mockReturnValue(
      makeUpdateChain({
        data: { id: TASK_ID, status: "completed", percent_complete: 100 },
        error: null,
      }),
    );
    const result = await updateTask(TASK_ID, PROJECT_ID, {
      status: "completed",
      percent_complete: 100,
    });
    expect(result.ok).toBe(true);
  });
});

describe("createMilestone", () => {
  it("rejects an empty name", async () => {
    const result = await createMilestone(PROJECT_ID, { name: "", due_date: "2026-06-15" });
    expect(result.ok).toBe(false);
  });

  it("rejects a missing due_date", async () => {
    const result = await createMilestone(PROJECT_ID, { name: "Pilot kickoff", due_date: "" });
    expect(result.ok).toBe(false);
  });

  it("succeeds with a valid milestone", async () => {
    mockFrom.mockReturnValue(
      makeInsertChain({
        data: { id: "ms-1", name: "Pilot kickoff", due_date: "2026-06-15", is_complete: false },
        error: null,
      }),
    );
    const result = await createMilestone(PROJECT_ID, {
      name: "Pilot kickoff",
      due_date: "2026-06-15",
    });
    expect(result.ok).toBe(true);
  });
});

describe("createDependency", () => {
  it("rejects non-uuid endpoints", async () => {
    const result = await createDependency(PROJECT_ID, {
      predecessor_id: "not-a-uuid",
      successor_id: "also-bad",
    });
    expect(result.ok).toBe(false);
  });

  it("succeeds with two valid task ids", async () => {
    mockFrom.mockReturnValue(
      makeInsertChain({
        data: {
          id: "dep-1",
          predecessor_id: TASK_ID,
          successor_id: "ffffffff-0000-0000-0000-000000000000",
          dep_type: "finish_to_start",
          lag_days: 0,
        },
        error: null,
      }),
    );
    const result = await createDependency(PROJECT_ID, {
      predecessor_id: TASK_ID,
      successor_id: "ffffffff-0000-0000-0000-000000000000",
    });
    expect(result.ok).toBe(true);
  });
});

describe("createExternalDep", () => {
  it("rejects an empty name", async () => {
    const result = await createExternalDep(PROJECT_ID, { name: "" });
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown dep_type", async () => {
    const result = await createExternalDep(PROJECT_ID, {
      name: "Vendor X",
      dep_type: "supernatural",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown status", async () => {
    const result = await createExternalDep(PROJECT_ID, {
      name: "Vendor X",
      status: "unknown",
    });
    expect(result.ok).toBe(false);
  });

  it("succeeds with a valid record", async () => {
    mockFrom.mockReturnValue(
      makeInsertChain({
        data: { id: "ed-1", name: "Vendor X", dep_type: "vendor", status: "open" },
        error: null,
      }),
    );
    const result = await createExternalDep(PROJECT_ID, {
      name: "Vendor X",
      dep_type: "vendor",
    });
    expect(result.ok).toBe(true);
  });
});

describe("generateShareToken", () => {
  it("issues a UUID and persists it", async () => {
    mockFrom.mockReturnValue(makeUpdateChain({ data: null, error: null }));
    const result = await generateShareToken(PROJECT_ID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.token).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    }
  });
});

describe("diffTaskImport (pure)", () => {
  it("classifies inserts, updates, and deletes correctly", async () => {
    const { diffTaskImport } = await import("@arbor/shared");
    const baseTask = {
      id: "t-existing",
      org_id: "o",
      project_id: "p",
      milestone_id: null,
      name: "Existing",
      description: null,
      status: "in_progress" as const,
      priority: "medium" as const,
      start_date: "2026-06-01",
      end_date: "2026-06-10",
      estimated_hours: 10,
      actual_hours: null,
      percent_complete: 30,
      sort_order: 0,
      created_at: "",
      updated_at: "",
      created_by: null,
      updated_by: null,
      version: 1,
    };
    const willBeDeleted = { ...baseTask, id: "t-gone", name: "Gone" };

    const importedRows = [
      {
        // unchanged â†’ no entry
        id: "t-existing",
        name: "Existing",
        description: null,
        status: "in_progress" as const,
        priority: "medium" as const,
        start_date: "2026-06-01",
        end_date: "2026-06-10",
        estimated_hours: 10,
        percent_complete: 30,
      },
      {
        // status changed â†’ update
        id: "t-existing", // same id, but the test array uses a different ID below
        name: "Existing",
        description: null,
        status: "completed" as const,
        priority: "medium" as const,
        start_date: "2026-06-01",
        end_date: "2026-06-10",
        estimated_hours: 10,
        percent_complete: 100,
      },
      {
        // new row
        id: null,
        name: "Brand new",
        description: null,
        status: "not_started" as const,
        priority: "low" as const,
        start_date: null,
        end_date: null,
        estimated_hours: null,
        percent_complete: 0,
      },
    ];

    const diff = diffTaskImport({
      currentTasks: [baseTask, willBeDeleted],
      importedRows,
    });

    expect(diff.inserts).toHaveLength(1);
    expect(diff.inserts[0]?.name).toBe("Brand new");
    expect(diff.updates).toHaveLength(1);
    expect(diff.updates[0]?.changedFields).toContain("status");
    expect(diff.deletes).toHaveLength(1);
    expect(diff.deletes[0]?.id).toBe("t-gone");
  });

  it("treats an unknown ID as a fresh insert", async () => {
    const { diffTaskImport } = await import("@arbor/shared");
    const diff = diffTaskImport({
      currentTasks: [],
      importedRows: [
        {
          id: "stale-id",
          name: "Recovered",
          description: null,
          status: "not_started" as const,
          priority: "medium" as const,
          start_date: null,
          end_date: null,
          estimated_hours: null,
          percent_complete: 0,
        },
      ],
    });
    expect(diff.inserts).toHaveLength(1);
    expect(diff.inserts[0]?.id).toBeNull();
  });
});
