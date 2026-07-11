import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));

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

vi.mock("@/lib/auth/role", () => ({
  getCurrentRole: vi.fn(() => Promise.resolve("manager")),
  isManager: vi.fn(() => Promise.resolve(true)),
}));

const {
  createImplementation,
  updateImplementationSetup,
  createRoom,
  createTrainer,
  createModule,
  createClass,
  addClassPrerequisite,
  createExternalInstructor,
  updateExternalInstructor,
  linkImplTrainerToInstructor,
  softDeleteExternalInstructor,
  importImplClasses,
} = await import("./actions");

const ORG_ID = "aaaaaaaa-0000-0000-0000-000000000000";
const IMPL_ID = "bbbbbbbb-0000-0000-0000-000000000000";
const CLASS_ID = "cccccccc-0000-0000-0000-000000000000";
const PREREQ_ID = "dddddddd-0000-0000-0000-000000000000";
const BUCKET_ID = "eeeeeeee-0000-0000-0000-000000000000";

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
  mockGetCurrentDepartmentId.mockResolvedValue("dddddddd-0000-0000-0000-000000000000");
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
    const result = await createImplementation({
      name: "EMR Cutover",
      bucket_id: BUCKET_ID,
    });
    expect(result.ok).toBe(true);
  });

  it("returns NO_ORG when org context missing", async () => {
    mockGetCurrentOrgId.mockResolvedValue(null);
    const result = await createImplementation({ name: "X", bucket_id: BUCKET_ID });
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
      bucket_id: BUCKET_ID,
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
    // Class A needs 5 sessions, has 5 â‡’ 100%.
    // Class B needs 10, has 3 â‡’ 30%.
    // Combined: (5 + 3) / (5 + 10) = 8/15 â‰ˆ 53%.
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

describe("generateSchedule (in-process CSP)", async () => {
  // The action now delegates to lib/training-planner/schedule-runner. The
  // happy-path math is covered by schedule-solver.test.ts; this suite
  // just guards the auth context check.
  const { generateSchedule } = await import("./actions");

  it("returns NO_ORG when org context missing", async () => {
    mockGetCurrentOrgId.mockResolvedValue(null);
    const result = await generateSchedule(IMPL_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NO_ORG");
  });
});

describe("createExternalInstructor", () => {
  it("inserts with is_external=true and returns the new row", async () => {
    const inserted = {
      id: "ee000000-0000-0000-0000-000000000001",
      org_id: ORG_ID,
      full_name: "Jane Consultant",
      email: "jane@example.com",
      is_external: true,
      status: "active",
    };
    const chain = makeInsertChain({ data: inserted, error: null });
    mockFrom.mockReturnValue(chain);
    const result = await createExternalInstructor({
      full_name: "Jane Consultant",
      email: "jane@example.com",
      notes: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.is_external).toBe(true);
      expect(result.data.full_name).toBe("Jane Consultant");
    }
    expect(mockFrom).toHaveBeenCalledWith("instructors");
    expect(chain.insert).toHaveBeenCalled();
    const insertArg = (chain.insert.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(insertArg.is_external).toBe(true);
    expect(insertArg.status).toBe("active");
  });

  it("rejects an empty name", async () => {
    const result = await createExternalInstructor({ full_name: "", email: null, notes: null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  it("rejects an invalid email", async () => {
    const result = await createExternalInstructor({
      full_name: "Jane",
      email: "not-an-email",
      notes: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });
});

describe("updateExternalInstructor", () => {
  it("renames the pool record scoped to is_external and cascades to linked impl_trainers", async () => {
    const instructorsChain = makeUpdateChain({
      data: {
        id: "inst-1",
        org_id: ORG_ID,
        full_name: "Jane Renamed",
        email: "jane2@example.com",
        is_external: true,
      },
      error: null,
    });
    const trainerUpdateFn = vi.fn().mockReturnThis();
    const trainerEqFn = vi.fn().mockReturnThis();
    const implTrainersChain: Record<string, unknown> = {
      update: trainerUpdateFn,
      eq: trainerEqFn,
      then: (resolve: (v: { error: null }) => unknown) => resolve({ error: null }),
    };
    mockFrom.mockReturnValueOnce(instructorsChain).mockReturnValueOnce(implTrainersChain);

    const result = await updateExternalInstructor("inst-1", IMPL_ID, {
      full_name: "Jane Renamed",
      email: "jane2@example.com",
    });

    expect(result.ok).toBe(true);
    expect(mockFrom).toHaveBeenNthCalledWith(1, "instructors");
    expect(instructorsChain.eq).toHaveBeenCalledWith("is_external", true);
    expect(instructorsChain.eq).toHaveBeenCalledWith("id", "inst-1");
    expect(mockFrom).toHaveBeenNthCalledWith(2, "impl_trainers");
    const trainerPatch = (trainerUpdateFn.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(trainerPatch.name).toBe("Jane Renamed");
    expect(trainerEqFn).toHaveBeenCalledWith("instructor_id", "inst-1");
  });

  it("rejects an empty name", async () => {
    const result = await updateExternalInstructor("inst-1", IMPL_ID, { full_name: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  it("rejects an invalid email", async () => {
    const result = await updateExternalInstructor("inst-1", IMPL_ID, { email: "nope" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });
});

describe("linkImplTrainerToInstructor", () => {
  it("sets instructor_id on the impl_trainer row scoped to the current org", async () => {
    const chain = makeUpdateChain({
      data: { id: "tr-1", instructor_id: "inst-1", name: "Jane" },
      error: null,
    });
    mockFrom.mockReturnValue(chain);
    const result = await linkImplTrainerToInstructor("tr-1", IMPL_ID, "inst-1");
    expect(result.ok).toBe(true);
    expect(chain.update).toHaveBeenCalledWith({ instructor_id: "inst-1" });
    expect(chain.eq).toHaveBeenCalledWith("id", "tr-1");
    expect(chain.eq).toHaveBeenCalledWith("org_id", ORG_ID);
  });
});

describe("softDeleteExternalInstructor", () => {
  it("sets deleted_at and scopes to is_external=true so internals are safe", async () => {
    const updateFn = vi.fn().mockReturnThis();
    const eqFn = vi.fn().mockReturnThis();
    const chain: Record<string, unknown> = {
      update: updateFn,
      eq: eqFn,
      // The action awaits the chain after the third .eq() — make the chain
      // a thenable that resolves to { error: null }.
      then: (resolve: (v: { error: null }) => unknown) => resolve({ error: null }),
    };
    mockFrom.mockReturnValue(chain);
    const result = await softDeleteExternalInstructor("inst-1", IMPL_ID);
    expect(result.ok).toBe(true);
    expect(mockFrom).toHaveBeenCalledWith("instructors");
    const updateArg = (updateFn.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(typeof updateArg.deleted_at).toBe("string");
    expect(eqFn).toHaveBeenCalledWith("is_external", true);
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

// A thenable select chain — `.select().eq().eq()` is awaited directly.
function makeSelectChain(result: { data?: unknown; error?: unknown }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  return chain;
}

// A thenable update chain — `.update().eq().eq()` is awaited directly.
function makeUpdateThenable(result: { error?: unknown }) {
  const chain = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  return chain;
}

describe("importImplClasses", () => {
  it("rejects non-array input", async () => {
    const result = await importImplClasses(IMPL_ID, "not-an-array");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("BAD_INPUT");
  });

  it("reports per-row validation failures without inserting", async () => {
    // Two initial fetches (existing classes, existing modules) → both empty.
    mockFrom.mockReturnValue(makeSelectChain({ data: [], error: null }));
    const result = await importImplClasses(IMPL_ID, [
      { name: "", hours_per_session: "4", expected_learners_per_session: "10" }, // empty name
      { name: "No hours", hours_per_session: "", expected_learners_per_session: "10" }, // missing hours
      { name: "Bad learners", hours_per_session: "2", expected_learners_per_session: "0" }, // < 1
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.failed).toBe(3);
      expect(result.data.created).toBe(0);
      expect(result.data.results[0]?.row).toBe(2); // header is row 1
    }
  });

  it("inserts a new class with coerced numeric fields", async () => {
    mockFrom
      .mockReturnValueOnce(makeSelectChain({ data: [], error: null })) // existing classes
      .mockReturnValueOnce(makeSelectChain({ data: [], error: null })) // existing modules
      .mockReturnValueOnce(makeInsertChain({ data: { id: CLASS_ID, name: "Epic" }, error: null }));

    const result = await importImplClasses(IMPL_ID, [
      { name: "Epic", hours_per_session: "4", expected_learners_per_session: "12" },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.created).toBe(1);
      expect(result.data.failed).toBe(0);
    }
  });

  it("updates an existing class matched by name (case-insensitive)", async () => {
    mockFrom
      .mockReturnValueOnce(
        makeSelectChain({ data: [{ id: CLASS_ID, name: "Epic", sort_order: 0 }], error: null }),
      ) // existing classes
      .mockReturnValueOnce(makeSelectChain({ data: [], error: null })) // existing modules
      .mockReturnValueOnce(makeUpdateThenable({ error: null }));

    const result = await importImplClasses(IMPL_ID, [
      { name: "EPIC", hours_per_session: "6", expected_learners_per_session: "8" },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.updated).toBe(1);
      expect(result.data.created).toBe(0);
    }
  });
});
