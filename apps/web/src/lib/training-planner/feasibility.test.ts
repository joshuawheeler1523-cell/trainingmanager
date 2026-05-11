import { describe, it, expect } from "vitest";
import type {
  Implementation,
  ImplClass,
  ImplRoom,
  ImplTrainer,
  ImplClassTrainer,
  ImplClassPrerequisite,
} from "@arbor/shared";
import { computeFeasibility, workingDaysInWindow, windowWeeks } from "./feasibility";

// ── Test fixtures ──────────────────────────────────────────────────────────

const baseImpl: Implementation = {
  id: "i1",
  org_id: "o1",
  name: "test impl",
  description: null,
  window_start_date: "2026-06-01", // Monday
  window_end_date: "2026-07-26", // Sunday (8 weeks)
  go_live_date: "2026-08-01",
  linked_project_id: null,
  linked_tra_id: null,
  status: "draft",
  current_step: 6,
  // Lunch defaults match the new SQL CHECK constraints: 720 = noon, 60 mins
  lunch_break_start_minutes: 720,
  lunch_break_length_minutes: 60,
  deleted_at: null,
  created_at: "2026-05-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
  created_by: null,
  updated_by: null,
  version: 1,
};

function makeRoom(over: Partial<ImplRoom> = {}): ImplRoom {
  return {
    id: over.id ?? "r1",
    org_id: "o1",
    implementation_id: "i1",
    name: over.name ?? "Room 1",
    location: null,
    seat_capacity: over.seat_capacity ?? 20,
    available_hours_per_day: over.available_hours_per_day ?? 8,
    available_days_of_week: over.available_days_of_week ?? [1, 2, 3, 4, 5],
    start_hour_local: over.start_hour_local ?? 9,
    timezone: over.timezone ?? null,
    equipment_tags: over.equipment_tags ?? [],
    equipment_notes: null,
    sort_order: 0,
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
    implementation_id: "i1",
    instructor_id: null,
    name: over.name ?? "Trainer 1",
    email: null,
    availability_hours_per_week: over.availability_hours_per_week ?? 40,
    max_concurrent_sessions: over.max_concurrent_sessions ?? 1,
    sort_order: 0,
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
    implementation_id: "i1",
    module_id: null,
    name: over.name ?? "Class 1",
    description: null,
    hours_per_session: over.hours_per_session ?? 2,
    expected_learners_per_session: over.expected_learners_per_session ?? 10,
    total_people_to_train: over.total_people_to_train ?? 30,
    required_equipment_tags: over.required_equipment_tags ?? [],
    required_equipment_notes: null,
    sort_order: over.sort_order ?? 0,
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
    created_by: null,
    updated_by: null,
  };
}

function classTrainer(classId: string, trainerId: string): ImplClassTrainer {
  return {
    id: `${classId}-${trainerId}`,
    org_id: "o1",
    impl_class_id: classId,
    impl_trainer_id: trainerId,
    created_at: "2026-05-01T00:00:00Z",
    created_by: null,
  };
}

function prereq(classId: string, prereqId: string): ImplClassPrerequisite {
  return {
    id: `${classId}-${prereqId}`,
    org_id: "o1",
    impl_class_id: classId,
    prerequisite_id: prereqId,
    created_at: "2026-05-01T00:00:00Z",
    created_by: null,
  };
}

// ── workingDaysInWindow ────────────────────────────────────────────────────

describe("workingDaysInWindow", () => {
  it("counts Mon–Fri days in a 2-week window starting Monday", () => {
    // 2026-06-01 (Mon) to 2026-06-14 (Sun) — 2 calendar weeks, 10 weekdays
    expect(workingDaysInWindow("2026-06-01", "2026-06-14", [1, 2, 3, 4, 5])).toBe(10);
  });

  it("counts Sat-only days", () => {
    expect(workingDaysInWindow("2026-06-01", "2026-06-14", [6])).toBe(2);
  });

  it("handles a one-day window on a working day", () => {
    expect(workingDaysInWindow("2026-06-01", "2026-06-01", [1, 2, 3, 4, 5])).toBe(1);
  });

  it("handles a one-day window NOT on a working day", () => {
    // 2026-06-06 is a Saturday
    expect(workingDaysInWindow("2026-06-06", "2026-06-06", [1, 2, 3, 4, 5])).toBe(0);
  });

  it("returns 0 when end is before start", () => {
    expect(workingDaysInWindow("2026-06-10", "2026-06-01", [1, 2, 3, 4, 5])).toBe(0);
  });

  it("returns 0 when the day set is empty", () => {
    expect(workingDaysInWindow("2026-06-01", "2026-06-14", [])).toBe(0);
  });
});

// ── windowWeeks ────────────────────────────────────────────────────────────

describe("windowWeeks", () => {
  it("returns 1 for a one-day window", () => {
    expect(windowWeeks("2026-06-01", "2026-06-01")).toBe(1);
  });

  it("returns 1 for a 7-day window", () => {
    expect(windowWeeks("2026-06-01", "2026-06-07")).toBe(1);
  });

  it("returns 2 for an 8-day window", () => {
    expect(windowWeeks("2026-06-01", "2026-06-08")).toBe(2);
  });

  it("returns 8 for a 56-day window (8 calendar weeks)", () => {
    expect(windowWeeks("2026-06-01", "2026-07-26")).toBe(8);
  });
});

// ── computeFeasibility — happy path ────────────────────────────────────────

describe("computeFeasibility — happy path", () => {
  it("flags 'feasible' when capacity easily covers need", () => {
    const result = computeFeasibility({
      implementation: baseImpl,
      rooms: [makeRoom()],
      trainers: [makeTrainer()],
      classes: [makeClass()], // 3 sessions × 2h = 6h needed; 40h/wk × 8wk = 320h available
      classTrainers: [classTrainer("c1", "t1")],
      prereqs: [],
    });
    expect(result.verdict).toBe("feasible");
    expect(result.totalSessionsNeeded).toBe(3); // ceil(30/10)
    expect(result.totalTrainerHoursNeeded).toBe(6);
    expect(result.unscheduledSessions).toBe(0);
    expect(result.ready).toBe(true);
    expect(result.estimatedCompletionDate).not.toBeNull();
  });
});

// ── Per-class blockers ─────────────────────────────────────────────────────

describe("per-class blockers", () => {
  it("flags 'no trainer assigned' when class has empty slate", () => {
    const result = computeFeasibility({
      implementation: baseImpl,
      rooms: [makeRoom()],
      trainers: [makeTrainer()],
      classes: [makeClass()],
      classTrainers: [], // class c1 has no trainer slate
      prereqs: [],
    });
    const cf = result.classFeasibility[0];
    expect(cf?.trainerSlateOk).toBe(false);
    expect(cf?.blockers.some((b) => b.toLowerCase().includes("trainer"))).toBe(true);
    expect(result.verdict).toBe("infeasible");
    expect(
      result.recommendations.some((r) => r.kind === "assign_trainer" && r.classId === "c1"),
    ).toBe(true);
  });

  it("flags 'no room with N seats' when class needs more seats than any room has", () => {
    const result = computeFeasibility({
      implementation: baseImpl,
      rooms: [makeRoom({ seat_capacity: 10 })],
      trainers: [makeTrainer()],
      classes: [makeClass({ expected_learners_per_session: 25 })],
      classTrainers: [classTrainer("c1", "t1")],
      prereqs: [],
    });
    const cf = result.classFeasibility[0];
    expect(cf?.roomCapacityOk).toBe(false);
    expect(
      result.recommendations.some((r) => r.kind === "add_capacity_room" && r.minSeats === 25),
    ).toBe(true);
  });

  it("propagates prereq unreachability", () => {
    // c1 has no trainer (unreachable); c2 depends on c1 → also unreachable
    const result = computeFeasibility({
      implementation: baseImpl,
      rooms: [makeRoom()],
      trainers: [makeTrainer()],
      classes: [makeClass({ id: "c1" }), makeClass({ id: "c2", name: "Class 2" })],
      classTrainers: [classTrainer("c2", "t1")], // c1 has none
      prereqs: [prereq("c2", "c1")],
    });
    const c2 = result.classFeasibility.find((f) => f.classId === "c2");
    expect(c2?.prereqReachable).toBe(false);
    expect(c2?.blockers.some((b) => b.toLowerCase().includes("prereq"))).toBe(true);
  });
});

// ── Recommendations math ───────────────────────────────────────────────────

describe("recommendations math", () => {
  it("recommends extending the window when trainer deficit > 0", () => {
    // 1 class × 1000 ppl × ceil(1000/10) = 100 sessions × 4h = 400h needed
    // 1 trainer × 10 h/wk × 8 wk = 80 hours available → deficit 320h
    const result = computeFeasibility({
      implementation: baseImpl,
      rooms: [makeRoom()],
      trainers: [makeTrainer({ availability_hours_per_week: 10 })],
      classes: [
        makeClass({
          hours_per_session: 4,
          expected_learners_per_session: 10,
          total_people_to_train: 1000,
        }),
      ],
      classTrainers: [classTrainer("c1", "t1")],
      prereqs: [],
    });
    expect(result.verdict).toBe("infeasible");
    expect(result.trainerUtilizationPct).not.toBeNull();
    expect(result.trainerUtilizationPct ?? 0).toBeGreaterThanOrEqual(100);
    expect(result.recommendations.some((r) => r.kind === "extend_window_weeks")).toBe(true);
    expect(result.recommendations.some((r) => r.kind === "add_trainers")).toBe(true);
    expect(result.recommendations.some((r) => r.kind === "add_trainer_hours_per_week")).toBe(true);
  });

  it("includes a reduce_per_session_to recommendation when per-session is large", () => {
    const result = computeFeasibility({
      implementation: baseImpl,
      rooms: [makeRoom({ seat_capacity: 40 })],
      trainers: [makeTrainer({ availability_hours_per_week: 5 })],
      classes: [
        makeClass({
          hours_per_session: 4,
          expected_learners_per_session: 40, // large per-session
          total_people_to_train: 400,
        }),
      ],
      classTrainers: [classTrainer("c1", "t1")],
      prereqs: [],
    });
    expect(result.recommendations.some((r) => r.kind === "reduce_per_session_to")).toBe(true);
  });
});

// ── Simulation ─────────────────────────────────────────────────────────────

describe("resource-pointer simulation", () => {
  it("places sessions back-to-back on the first day for the happy path", () => {
    const result = computeFeasibility({
      implementation: {
        ...baseImpl,
        window_start_date: "2026-06-01",
        window_end_date: "2026-06-30",
      },
      rooms: [makeRoom()],
      trainers: [makeTrainer()],
      classes: [makeClass()], // 3 × 2h = 6h, fits in one day
      classTrainers: [classTrainer("c1", "t1")],
      prereqs: [],
    });
    // 3 sessions × 2 hours each from 9 AM → last session ends at 15:00 on day 1
    expect(result.estimatedCompletionDate).toBe("2026-06-01");
    expect(result.unscheduledSessions).toBe(0);
  });

  it("respects trainer weekly cap by spilling into next week", () => {
    // 1 trainer × 8 h/wk; 10 sessions × 2h = 20h needed → 3 weeks of work
    const result = computeFeasibility({
      implementation: baseImpl,
      rooms: [makeRoom()],
      trainers: [makeTrainer({ availability_hours_per_week: 8 })],
      classes: [
        makeClass({
          hours_per_session: 2,
          expected_learners_per_session: 10,
          total_people_to_train: 100, // 10 sessions
        }),
      ],
      classTrainers: [classTrainer("c1", "t1")],
      prereqs: [],
    });
    expect(result.estimatedCompletionDate).not.toBeNull();
    // After 4 sessions trainer is full for week 1; week 2 starts Monday 2026-06-08
    // 4 sessions per week → 10 sessions takes 3 weeks (4 + 4 + 2)
    expect(result.estimatedCompletionDate?.startsWith("2026-06-15")).toBe(true);
  });

  it("marks sessions unscheduled when no eligible trainer/room exists", () => {
    const result = computeFeasibility({
      implementation: baseImpl,
      rooms: [makeRoom()],
      trainers: [makeTrainer()],
      classes: [makeClass({ expected_learners_per_session: 25 })], // bigger than room
      classTrainers: [classTrainer("c1", "t1")],
      prereqs: [],
    });
    expect(result.unscheduledSessions).toBeGreaterThan(0);
  });

  it("distributes load evenly across trainers (least-loaded wins)", () => {
    // 2 trainers, 4 sessions of 2h each — should split 2-2, not 4-0
    const result = computeFeasibility({
      implementation: baseImpl,
      rooms: [makeRoom()],
      trainers: [makeTrainer({ id: "t1", name: "T1" }), makeTrainer({ id: "t2", name: "T2" })],
      classes: [
        makeClass({
          hours_per_session: 2,
          expected_learners_per_session: 10,
          total_people_to_train: 40, // 4 sessions
        }),
      ],
      classTrainers: [classTrainer("c1", "t1"), classTrainer("c1", "t2")],
      prereqs: [],
    });
    const utils = result.trainerUtilization;
    expect(utils.length).toBe(2);
    expect(utils[0]?.hoursAssigned).toBe(4); // both should be 4h
    expect(utils[1]?.hoursAssigned).toBe(4);
  });

  it("prefers best-fit (smaller capacity) room when both fit", () => {
    const result = computeFeasibility({
      implementation: baseImpl,
      rooms: [
        makeRoom({ id: "big", name: "Big", seat_capacity: 100 }),
        makeRoom({ id: "small", name: "Small", seat_capacity: 12 }),
      ],
      trainers: [makeTrainer()],
      classes: [makeClass({ expected_learners_per_session: 10 })], // either fits; small should win
      classTrainers: [classTrainer("c1", "t1")],
      prereqs: [],
    });
    const small = result.roomUtilization.find((r) => r.id === "small");
    const big = result.roomUtilization.find((r) => r.id === "big");
    expect(small?.hoursAssigned ?? 0).toBeGreaterThan(0);
    expect(big?.hoursAssigned ?? 0).toBe(0);
  });

  it("class B's first session lands AFTER class A's last session when A is prereq", () => {
    const a = makeClass({
      id: "a",
      name: "A",
      hours_per_session: 2,
      expected_learners_per_session: 10,
      total_people_to_train: 20, // 2 sessions
      sort_order: 0,
    });
    const b = makeClass({
      id: "b",
      name: "B",
      hours_per_session: 2,
      expected_learners_per_session: 10,
      total_people_to_train: 10, // 1 session
      sort_order: 1,
    });
    const result = computeFeasibility({
      implementation: baseImpl,
      rooms: [makeRoom()],
      trainers: [makeTrainer()],
      classes: [a, b],
      classTrainers: [classTrainer("a", "t1"), classTrainer("b", "t1")],
      prereqs: [prereq("b", "a")],
    });
    expect(result.unscheduledSessions).toBe(0);
    // A: 2 sessions × 2h on day 1 (9-11, 11-13); B: 1 session × 2h starting >= 13:00 day 1
    expect(result.estimatedCompletionDate).toBe("2026-06-01");
  });
});

// ── Phase C: business hours, lunch, equipment ──────────────────────────────

describe("business hours (start_hour_local)", () => {
  it("anchors the first session at the room's start hour", () => {
    const result = computeFeasibility({
      implementation: { ...baseImpl, window_end_date: "2026-06-07" },
      rooms: [makeRoom({ start_hour_local: 7 })],
      trainers: [makeTrainer()],
      classes: [
        makeClass({
          hours_per_session: 2,
          expected_learners_per_session: 10,
          total_people_to_train: 10, // 1 session
        }),
      ],
      classTrainers: [classTrainer("c1", "t1")],
      prereqs: [],
    });
    expect(result.estimatedCompletionDate).toBe("2026-06-01");
    expect(result.unscheduledSessions).toBe(0);
    // Hours assigned should equal the single session's duration.
    const r = result.roomUtilization[0];
    expect(r?.hoursAssigned).toBe(2);
  });

  it("rejects sessions that don't fit even with a late start hour", () => {
    // start at 9, 8 work hours/day → day ends at 17. 9-hour session can't fit.
    const result = computeFeasibility({
      implementation: { ...baseImpl, window_end_date: "2026-06-05" },
      rooms: [makeRoom({ start_hour_local: 9, available_hours_per_day: 8 })],
      trainers: [makeTrainer()],
      classes: [
        makeClass({
          hours_per_session: 9,
          expected_learners_per_session: 10,
          total_people_to_train: 10,
        }),
      ],
      classTrainers: [classTrainer("c1", "t1")],
      prereqs: [],
    });
    expect(result.unscheduledSessions).toBe(1);
  });
});

describe("lunch break", () => {
  it("pushes a session past lunch when it would otherwise overlap", () => {
    // Lunch 12:00–13:00. 2-hour sessions stack 9-11, 11-13 → second one overlaps lunch.
    // With lunch enabled, sequence should be 9-11, then 13-15.
    const result = computeFeasibility({
      implementation: {
        ...baseImpl,
        window_end_date: "2026-06-05",
        lunch_break_start_minutes: 720, // 12:00
        lunch_break_length_minutes: 60,
      },
      rooms: [makeRoom({ start_hour_local: 9, available_hours_per_day: 8 })],
      trainers: [makeTrainer()],
      classes: [
        makeClass({
          hours_per_session: 2,
          expected_learners_per_session: 10,
          total_people_to_train: 40, // 4 sessions
        }),
      ],
      classTrainers: [classTrainer("c1", "t1")],
      prereqs: [],
    });
    expect(result.unscheduledSessions).toBe(0);
    // 4 sessions × 2h with one lunch push = 9-11, 13-15, 15-17, then next day 9-11.
    // (slot 2 at 11 overlaps 12-13; pushed to 13.) Completion on day 2.
    expect(result.estimatedCompletionDate).toBe("2026-06-02");
  });

  it("ignores lunch when length is 0", () => {
    const result = computeFeasibility({
      implementation: {
        ...baseImpl,
        window_end_date: "2026-06-02",
        lunch_break_start_minutes: 720,
        lunch_break_length_minutes: 0,
      },
      rooms: [makeRoom({ available_hours_per_day: 8 })],
      trainers: [makeTrainer()],
      classes: [
        makeClass({
          hours_per_session: 2,
          expected_learners_per_session: 10,
          total_people_to_train: 40, // 4 sessions
        }),
      ],
      classTrainers: [classTrainer("c1", "t1")],
      prereqs: [],
    });
    expect(result.unscheduledSessions).toBe(0);
    // All 4 sessions stack back-to-back on day 1: 9-11, 11-13, 13-15, 15-17.
    expect(result.estimatedCompletionDate).toBe("2026-06-01");
  });
});

describe("equipment tags", () => {
  it("excludes rooms that don't satisfy required tags", () => {
    const result = computeFeasibility({
      implementation: baseImpl,
      rooms: [
        makeRoom({ id: "no-equip", equipment_tags: ["projector"] }),
        makeRoom({ id: "has-equip", equipment_tags: ["projector", "iv-pump"] }),
      ],
      trainers: [makeTrainer()],
      classes: [makeClass({ required_equipment_tags: ["iv-pump"] })],
      classTrainers: [classTrainer("c1", "t1")],
      prereqs: [],
    });
    // Only has-equip should pick up sessions.
    const used = result.roomUtilization.find((r) => r.id === "has-equip");
    const notUsed = result.roomUtilization.find((r) => r.id === "no-equip");
    expect(used?.hoursAssigned ?? 0).toBeGreaterThan(0);
    expect(notUsed?.hoursAssigned ?? 0).toBe(0);
  });

  it("blocks a class with no equipment-matching room and surfaces the recommendation", () => {
    const result = computeFeasibility({
      implementation: baseImpl,
      rooms: [makeRoom({ equipment_tags: ["projector"] })],
      trainers: [makeTrainer()],
      classes: [makeClass({ required_equipment_tags: ["iv-pump"] })],
      classTrainers: [classTrainer("c1", "t1")],
      prereqs: [],
    });
    const cf = result.classFeasibility[0];
    expect(cf?.roomCapacityOk).toBe(false);
    expect(cf?.blockers.some((b) => b.toLowerCase().includes("equipment"))).toBe(true);
  });

  it("passes when class has no equipment requirement (all rooms eligible)", () => {
    const result = computeFeasibility({
      implementation: baseImpl,
      rooms: [makeRoom({ equipment_tags: [] })],
      trainers: [makeTrainer()],
      classes: [makeClass({ required_equipment_tags: [] })],
      classTrainers: [classTrainer("c1", "t1")],
      prereqs: [],
    });
    expect(result.classFeasibility[0]?.roomCapacityOk).toBe(true);
  });
});

// ── Ready gate ─────────────────────────────────────────────────────────────

describe("ready gate", () => {
  it("not ready when no rooms", () => {
    const result = computeFeasibility({
      implementation: baseImpl,
      rooms: [],
      trainers: [makeTrainer()],
      classes: [makeClass()],
      classTrainers: [classTrainer("c1", "t1")],
      prereqs: [],
    });
    expect(result.ready).toBe(false);
    expect(result.readyBlockers.some((b) => b.toLowerCase().includes("room"))).toBe(true);
  });

  it("not ready when one class has an unfixable blocker", () => {
    const result = computeFeasibility({
      implementation: baseImpl,
      rooms: [makeRoom({ seat_capacity: 5 })],
      trainers: [makeTrainer()],
      classes: [makeClass({ expected_learners_per_session: 25 })], // no room fits
      classTrainers: [classTrainer("c1", "t1")],
      prereqs: [],
    });
    expect(result.ready).toBe(false);
  });
});
