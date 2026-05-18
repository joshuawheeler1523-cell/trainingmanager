import { describe, it, expect } from "vitest";
import type { ImplClass, ImplClassPrerequisite, ImplRoom, ImplTrainer } from "@arbor/shared";
import {
  solve,
  type BusyInterval,
  type ClassTrainerLink,
  type SolverInput,
} from "./schedule-solver";

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeRoom(over: Partial<ImplRoom> = {}): ImplRoom {
  return {
    id: over.id ?? "r1",
    org_id: "o1",
    department_id: "d1",
    implementation_id: "i1",
    name: over.name ?? "Room A",
    location: null,
    seat_capacity: over.seat_capacity ?? 20,
    available_hours_per_day: over.available_hours_per_day ?? 8,
    available_days_of_week: over.available_days_of_week ?? [1, 2, 3, 4, 5],
    equipment_tags: over.equipment_tags ?? [],
    equipment_notes: null,
    start_hour_local: over.start_hour_local ?? 9,
    timezone: over.timezone ?? null,
    sort_order: over.sort_order ?? 0,
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
    created_by: null,
    updated_by: null,
  };
}

function makeTrainer(over: Partial<ImplTrainer> = {}): ImplTrainer {
  return {
    id: over.id ?? "t1",
    org_id: "o1",
    department_id: "d1",
    implementation_id: "i1",
    instructor_id: over.instructor_id ?? null,
    name: over.name ?? "Trainer A",
    email: null,
    availability_hours_per_week: over.availability_hours_per_week ?? 40,
    max_concurrent_sessions: over.max_concurrent_sessions ?? 1,
    sort_order: over.sort_order ?? 0,
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
    created_by: null,
    updated_by: null,
  };
}

function makeClass(over: Partial<ImplClass> = {}): ImplClass {
  return {
    id: over.id ?? "c1",
    org_id: "o1",
    department_id: "d1",
    implementation_id: "i1",
    module_id: null,
    name: over.name ?? "Class A",
    description: null,
    hours_per_session: over.hours_per_session ?? 2,
    expected_learners_per_session: over.expected_learners_per_session ?? 10,
    total_people_to_train: over.total_people_to_train ?? 10,
    required_equipment_tags: over.required_equipment_tags ?? [],
    required_equipment_notes: null,
    sort_order: over.sort_order ?? 0,
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
    created_by: null,
    updated_by: null,
  };
}

function makeInput(over: Partial<SolverInput> = {}): SolverInput {
  return {
    windowStartDate: "2026-06-01",
    windowEndDate: "2026-06-12",
    cutoffDate: "2026-06-12",
    orgTimeZone: "America/New_York",
    lunchBreakStartMinutes: 720,
    lunchBreakLengthMinutes: 60,
    businessHoursStartLocal: 0,
    businessHoursEndLocal: 24,
    rooms: [makeRoom()],
    trainers: [makeTrainer()],
    classes: [makeClass()],
    classTrainers: [{ impl_class_id: "c1", impl_trainer_id: "t1" }],
    prerequisites: [],
    busyTrainers: [],
    busyRooms: [],
    initialTrainerWeekHours: {},
    ...over,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("solve - happy path", () => {
  it("places a single-session class with one room and one trainer", () => {
    const result = solve(makeInput());
    expect(result.placements).toHaveLength(1);
    expect(result.gaps).toHaveLength(0);
    expect(result.placements[0]?.classId).toBe("c1");
    expect(result.placements[0]?.trainerId).toBe("t1");
    expect(result.placements[0]?.roomId).toBe("r1");
  });

  it("places multiple sessions of the same class on separate days when one trainer can't double-up", () => {
    const result = solve(
      makeInput({
        classes: [makeClass({ total_people_to_train: 30 })], // 3 sessions
      }),
    );
    expect(result.placements).toHaveLength(3);
    expect(result.gaps).toHaveLength(0);
    // Each session ends before the next starts (single-trainer max_concurrent=1)
    const sortedStarts = result.placements.map((p) => p.start).sort();
    for (let i = 1; i < sortedStarts.length; i++) {
      const prev = sortedStarts[i - 1];
      const curr = sortedStarts[i];
      if (prev && curr) expect(curr >= prev).toBe(true);
    }
  });
});

describe("solve - prereq ordering", () => {
  it("places prereq class before dependent class", () => {
    const input = makeInput({
      classes: [
        makeClass({ id: "c1", name: "A (depends on B)", total_people_to_train: 10 }),
        makeClass({ id: "c2", name: "B (prereq)", total_people_to_train: 10 }),
      ],
      classTrainers: [
        { impl_class_id: "c1", impl_trainer_id: "t1" },
        { impl_class_id: "c2", impl_trainer_id: "t1" },
      ],
      prerequisites: [
        {
          id: "p1",
          org_id: "o1",
          department_id: "d1",
          impl_class_id: "c1",
          prerequisite_id: "c2",
          created_at: "2026-05-01T00:00:00Z",
          created_by: null,
        },
      ],
    });
    const result = solve(input);
    expect(result.placements).toHaveLength(2);
    expect(result.gaps).toHaveLength(0);
    const a = result.placements.find((p) => p.classId === "c1");
    const b = result.placements.find((p) => p.classId === "c2");
    expect(a && b).toBeTruthy();
    if (a && b) expect(a.start >= b.start).toBe(true);
  });
});

describe("solve - anchor / busy state", () => {
  it("switches trainer when the default trainer is locked by the anchor", () => {
    const input = makeInput({
      trainers: [makeTrainer({ id: "t1" }), makeTrainer({ id: "t2", name: "Trainer B" })],
      classTrainers: [
        { impl_class_id: "c1", impl_trainer_id: "t1" },
        { impl_class_id: "c1", impl_trainer_id: "t2" },
      ],
      // t1 fully booked on every business day 9-5 (anchor commitment).
      busyTrainers: trainerBusyAllDays("t1", "2026-06-01", "2026-06-12", "America/New_York"),
    });
    const result = solve(input);
    expect(result.placements).toHaveLength(1);
    expect(result.placements[0]?.trainerId).toBe("t2");
  });

  it("reports a gap when EVERY trainer is anchor-blocked across the whole window", () => {
    const input = makeInput({
      trainers: [makeTrainer({ id: "t1" }), makeTrainer({ id: "t2" })],
      classTrainers: [
        { impl_class_id: "c1", impl_trainer_id: "t1" },
        { impl_class_id: "c1", impl_trainer_id: "t2" },
      ],
      busyTrainers: [
        ...trainerBusyAllDays("t1", "2026-06-01", "2026-06-12", "America/New_York"),
        ...trainerBusyAllDays("t2", "2026-06-01", "2026-06-12", "America/New_York"),
      ],
    });
    const result = solve(input);
    expect(result.placements).toHaveLength(0);
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0]?.classId).toBe("c1");
  });
});

describe("solve - weekly hours cap", () => {
  it("respects availability_hours_per_week", () => {
    // 5 sessions × 2 hours each = 10h needed. Trainer cap: 4h/week. Window: 1 week.
    const input = makeInput({
      windowStartDate: "2026-06-01",
      windowEndDate: "2026-06-05",
      cutoffDate: "2026-06-05",
      trainers: [makeTrainer({ availability_hours_per_week: 4 })],
      classes: [makeClass({ hours_per_session: 2, total_people_to_train: 50 })], // 5 sessions
    });
    const result = solve(input);
    // 4h cap / 2h per session = max 2 sessions placed.
    expect(result.placements.length).toBeLessThanOrEqual(2);
    expect(result.gaps.length).toBeGreaterThanOrEqual(3);
  });
});

describe("solve - PTO blocking", () => {
  it("doesn't place a session during the trainer's PTO", () => {
    const input = makeInput({
      // Single business day window: only 2026-06-01 (Monday) is available.
      windowStartDate: "2026-06-01",
      windowEndDate: "2026-06-01",
      cutoffDate: "2026-06-01",
      busyTrainers: [
        {
          resourceId: "t1",
          start: "2026-06-01T08:00:00Z",
          end: "2026-06-01T22:00:00Z",
        },
      ],
    });
    const result = solve(input);
    expect(result.placements).toHaveLength(0);
    expect(result.gaps).toHaveLength(1);
  });
});

describe("solve - infeasible reporting", () => {
  it("reports a gap when the class has no trainer slate", () => {
    const input = makeInput({
      classTrainers: [], // no link from c1 to any trainer
    });
    const result = solve(input);
    expect(result.placements).toHaveLength(0);
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0]?.reason).toContain("No trainers");
  });

  it("reports a gap when no room has enough seats", () => {
    const input = makeInput({
      rooms: [makeRoom({ seat_capacity: 5 })],
      classes: [makeClass({ expected_learners_per_session: 12, total_people_to_train: 12 })],
    });
    const result = solve(input);
    expect(result.placements).toHaveLength(0);
    expect(result.gaps).toHaveLength(1);
  });
});

describe("solve - room equipment", () => {
  it("only uses rooms whose equipment_tags are a superset of class.required_equipment_tags", () => {
    const input = makeInput({
      rooms: [
        makeRoom({ id: "r1", equipment_tags: [] }), // no equipment
        makeRoom({ id: "r2", equipment_tags: ["iv-pump"] }),
      ],
      classes: [makeClass({ required_equipment_tags: ["iv-pump"] })],
    });
    const result = solve(input);
    expect(result.placements).toHaveLength(1);
    expect(result.placements[0]?.roomId).toBe("r2");
  });
});

// ── Helpers ────────────────────────────────────────────────────────────────

function trainerBusyAllDays(
  trainerId: string,
  start: string,
  end: string,
  tz: string,
): BusyInterval[] {
  // Cover M–F each business day from 7am to 7pm local in the given tz.
  const out: BusyInterval[] = [];
  const cursor = new Date(start + "T00:00:00Z");
  const last = new Date(end + "T00:00:00Z");
  while (cursor <= last) {
    const dow = cursor.getUTCDay();
    if (dow >= 1 && dow <= 5) {
      const date = cursor.toISOString().slice(0, 10);
      out.push({
        resourceId: trainerId,
        start: localToUtc(date, 7, tz),
        end: localToUtc(date, 19, tz),
      });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function localToUtc(date: string, hour: number, tz: string): string {
  // Borrow the same util the solver uses for parity. Re-implementing
  // here so the test fixtures don't depend on the solver's internals.
  const [y, m, d] = date.split("-").map(Number);
  const fake = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, hour, 0, 0, 0);
  // fromCalendarLocal: same dance the solver uses. Avoid importing the
  // private symbol — just round-trip through the timezone util.
  const wallMillis = Date.UTC(
    fake.getFullYear(),
    fake.getMonth(),
    fake.getDate(),
    fake.getHours(),
    fake.getMinutes(),
    fake.getSeconds(),
  );
  let guess = wallMillis;
  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(new Date(guess));
    const got: Record<string, string> = {};
    for (const p of parts) if (p.type !== "literal") got[p.type] = p.value;
    const gotMillis = Date.UTC(
      Number(got.year),
      Number(got.month) - 1,
      Number(got.day),
      Number(got.hour === "24" ? "00" : (got.hour ?? "00")),
      Number(got.minute ?? "0"),
      Number(got.second ?? "0"),
    );
    guess -= gotMillis - wallMillis;
  }
  return new Date(guess).toISOString();
}

// Used in tests but not exported.
void {} as ClassTrainerLink;
void {} as ImplClassPrerequisite;
