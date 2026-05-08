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
  createImplementation,
  updateImplementationSetup,
  createRoom,
  createTrainer,
  createModule,
  createClass,
  addClassPrerequisite,
} = await import("./actions");

const ORG_ID = "aaaaaaaa-0000-0000-0000-000000000000";
const IMPL_ID = "bbbbbbbb-0000-0000-0000-000000000000";
const CLASS_ID = "cccccccc-0000-0000-0000-000000000000";
const PREREQ_ID = "dddddddd-0000-0000-0000-000000000000";

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

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentOrgId.mockResolvedValue(ORG_ID);
});

describe("createImplementation", () => {
  it("rejects an empty name", async () => {
    const result = await createImplementation({ name: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  it("succeeds with just a name (other fields fill in later)", async () => {
    mockFrom.mockReturnValue(
      makeInsertChain({
        data: { id: IMPL_ID, org_id: ORG_ID, name: "EMR Cutover", status: "draft" },
        error: null,
      }),
    );
    const result = await createImplementation({ name: "EMR Cutover" });
    expect(result.ok).toBe(true);
  });

  it("returns NO_ORG when org context missing", async () => {
    mockGetCurrentOrgId.mockResolvedValue(null);
    const result = await createImplementation({ name: "X" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NO_ORG");
  });
});

describe("updateImplementationSetup", () => {
  it("rejects when window dates are missing", async () => {
    const result = await updateImplementationSetup(IMPL_ID, {
      name: "EMR Cutover",
      window_start_date: "",
      window_end_date: "",
      go_live_date: "2026-08-01",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects when go_live_date is missing", async () => {
    const result = await updateImplementationSetup(IMPL_ID, {
      name: "EMR Cutover",
      window_start_date: "2026-06-01",
      window_end_date: "2026-07-15",
      go_live_date: "",
    });
    expect(result.ok).toBe(false);
  });

  it("succeeds with all required dates set", async () => {
    mockFrom.mockReturnValue(
      makeUpdateChain({
        data: {
          id: IMPL_ID,
          name: "EMR Cutover",
          window_start_date: "2026-06-01",
          window_end_date: "2026-07-15",
          go_live_date: "2026-08-01",
          status: "draft",
        },
        error: null,
      }),
    );
    const result = await updateImplementationSetup(IMPL_ID, {
      name: "EMR Cutover",
      window_start_date: "2026-06-01",
      window_end_date: "2026-07-15",
      go_live_date: "2026-08-01",
    });
    expect(result.ok).toBe(true);
  });
});

describe("createRoom", () => {
  it("rejects an empty name", async () => {
    const result = await createRoom(IMPL_ID, { name: "", seat_capacity: 12 });
    expect(result.ok).toBe(false);
  });

  it("rejects seat_capacity < 1", async () => {
    const result = await createRoom(IMPL_ID, { name: "Room A", seat_capacity: 0 });
    expect(result.ok).toBe(false);
  });

  it("rejects available_hours_per_day > 24", async () => {
    const result = await createRoom(IMPL_ID, {
      name: "Room A",
      seat_capacity: 10,
      available_hours_per_day: 25,
    });
    expect(result.ok).toBe(false);
  });

  it("succeeds with valid input", async () => {
    mockFrom.mockReturnValue(
      makeInsertChain({
        data: { id: "r-1", name: "Room A", seat_capacity: 12, available_hours_per_day: 8 },
        error: null,
      }),
    );
    const result = await createRoom(IMPL_ID, {
      name: "Room A",
      seat_capacity: 12,
      available_hours_per_day: 8,
    });
    expect(result.ok).toBe(true);
  });
});

describe("createTrainer", () => {
  it("rejects an empty name", async () => {
    const result = await createTrainer(IMPL_ID, {
      name: "",
      availability_hours_per_week: 20,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects negative availability", async () => {
    const result = await createTrainer(IMPL_ID, {
      name: "Sam",
      availability_hours_per_week: -5,
    });
    expect(result.ok).toBe(false);
  });

  it("succeeds with external trainer (no instructor_id)", async () => {
    mockFrom.mockReturnValue(
      makeInsertChain({
        data: { id: "t-1", name: "Vendor Specialist", instructor_id: null },
        error: null,
      }),
    );
    const result = await createTrainer(IMPL_ID, {
      name: "Vendor Specialist",
      availability_hours_per_week: 30,
    });
    expect(result.ok).toBe(true);
  });
});

describe("createClass", () => {
  it("rejects hours_per_session < 0.25", async () => {
    const result = await createClass(IMPL_ID, {
      name: "Med Admin",
      hours_per_session: 0.1,
      expected_learners_per_session: 12,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects expected_learners_per_session < 1", async () => {
    const result = await createClass(IMPL_ID, {
      name: "Med Admin",
      hours_per_session: 2,
      expected_learners_per_session: 0,
    });
    expect(result.ok).toBe(false);
  });

  it("succeeds with valid input", async () => {
    mockFrom.mockReturnValue(
      makeInsertChain({
        data: { id: CLASS_ID, name: "Med Admin", hours_per_session: 2 },
        error: null,
      }),
    );
    const result = await createClass(IMPL_ID, {
      name: "Med Admin",
      hours_per_session: 2,
      expected_learners_per_session: 12,
      total_people_to_train: 240,
    });
    expect(result.ok).toBe(true);
  });
});

describe("createModule", () => {
  it("rejects an empty name", async () => {
    const result = await createModule(IMPL_ID, { name: "" });
    expect(result.ok).toBe(false);
  });
});

describe("addClassPrerequisite", () => {
  it("rejects self-as-prerequisite without round-tripping the DB", async () => {
    const result = await addClassPrerequisite(CLASS_ID, IMPL_ID, CLASS_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION");
      expect(result.error.message).toMatch(/cannot be its own/i);
    }
  });

  it("relays cycle errors from the DB trigger as a CYCLE result code", async () => {
    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "23514", message: "class prerequisite would create a cycle" },
      }),
    });
    const result = await addClassPrerequisite(CLASS_ID, IMPL_ID, PREREQ_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CYCLE");
  });
});

describe("training-planner pure helpers", () => {
  it("sessionsNeeded uses ceiling division", async () => {
    const { sessionsNeeded } = await import("@arbor/shared");
    expect(sessionsNeeded({ total_people_to_train: 100, expected_learners_per_session: 12 })).toBe(
      9,
    );
    expect(sessionsNeeded({ total_people_to_train: 12, expected_learners_per_session: 12 })).toBe(
      1,
    );
    expect(sessionsNeeded({ total_people_to_train: 0, expected_learners_per_session: 12 })).toBe(0);
    expect(sessionsNeeded({ total_people_to_train: 50, expected_learners_per_session: 0 })).toBe(0);
  });

  it("implementationCompletion returns null when no class needs sessions", async () => {
    const { implementationCompletion } = await import("@arbor/shared");
    expect(
      implementationCompletion({
        classes: [{ id: "c-1", total_people_to_train: 0, expected_learners_per_session: 12 }],
        sessionsByClass: new Map(),
      }),
    ).toBe(null);
  });

  it("implementationCompletion clamps each class to its own need", async () => {
    const { implementationCompletion } = await import("@arbor/shared");
    // Class A needs 5 sessions, has 5 ⇒ 100%.
    // Class B needs 10, has 3 ⇒ 30%.
    // Combined: (5 + 3) / (5 + 10) = 8/15 ≈ 53%.
    const result = implementationCompletion({
      classes: [
        { id: "a", total_people_to_train: 60, expected_learners_per_session: 12 },
        { id: "b", total_people_to_train: 100, expected_learners_per_session: 10 },
      ],
      sessionsByClass: new Map([
        ["a", 5],
        ["b", 3],
      ]),
    });
    expect(result).toBe(53);
  });

  it("implementationCompletion does not let an over-scheduled class push above 100", async () => {
    const { implementationCompletion } = await import("@arbor/shared");
    const result = implementationCompletion({
      classes: [{ id: "a", total_people_to_train: 24, expected_learners_per_session: 12 }],
      sessionsByClass: new Map([["a", 99]]),
    });
    expect(result).toBe(100);
  });
});

describe("generateSchedule (RPC wrapper)", async () => {
  const { generateSchedule } = await import("./actions");

  it("returns NO_ORG when org context missing", async () => {
    mockGetCurrentOrgId.mockResolvedValue(null);
    const result = await generateSchedule(IMPL_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NO_ORG");
  });

  it("relays the RPC payload", async () => {
    const mockClient = {
      from: mockFrom,
      rpc: vi.fn().mockResolvedValue({
        data: { sessions: 5, conflicts: 0, capacity_gaps: [] },
        error: null,
      }),
    };
    const { createClient: cc } = await import("@/lib/supabase/server");
    (cc as unknown as { mockResolvedValueOnce: (v: unknown) => void }).mockResolvedValueOnce(
      mockClient,
    );
    const result = await generateSchedule(IMPL_ID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.sessions).toBe(5);
      expect(result.data.conflicts).toBe(0);
    }
  });
});

describe("ICS helpers", () => {
  it("toIcsDate strips dashes/colons and milliseconds", async () => {
    const { toIcsDate } = await import("@/app/api/training-planner/[id]/schedule.ics/route");
    const d = new Date("2026-06-15T14:30:00.123Z");
    expect(toIcsDate(d)).toBe("20260615T143000Z");
  });

  it("escapeIcs escapes backslash, comma, semicolon, and newline", async () => {
    const { escapeIcs } = await import("@/app/api/training-planner/[id]/schedule.ics/route");
    // Input chars: a , space b ; space c <newline> d \ e
    // Expected:    a \, space b \; space c \n d \\ e
    expect(escapeIcs("a, b; c\nd\\e")).toBe("a\\, b\\; c\\nd\\\\e");
  });
});
