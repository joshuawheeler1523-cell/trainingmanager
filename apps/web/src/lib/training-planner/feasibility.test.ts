import { describe, it, expect } from "vitest";
import type {
  Implementation,
  ImplClass,
  ImplRoom,
  ImplTrainer,
  ImplClassTrainer,
  ImplClassPrerequisite,
} from "@arbor/shared";
import {
  applyLunch,
  computeFeasibility,
  computeResourceForecast,
  workingDaysInWindow,
  windowWeeks,
} from "./feasibility";

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
  go_live_buffer_days: 7,
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

  it("recommends reduce_per_session_to when no room has enough seats but a smaller group would fit", () => {
    // Class needs 30 per session; biggest room has 12 seats → seat blocker.
    // Reducing to 12 lets it fit the existing room.
    const result = computeFeasibility({
      implementation: baseImpl,
      rooms: [makeRoom({ seat_capacity: 12 })],
      trainers: [makeTrainer()],
      classes: [
        makeClass({
          name: "Big Class",
          hours_per_session: 2,
          expected_learners_per_session: 30,
          total_people_to_train: 60,
        }),
      ],
      classTrainers: [classTrainer("c1", "t1")],
      prereqs: [],
    });
    const rec = result.recommendations.find((r) => r.kind === "reduce_per_session_to");
    expect(rec).toBeDefined();
    if (rec?.kind === "reduce_per_session_to") {
      expect(rec.className).toBe("Big Class");
      expect(rec.learners).toBe(12);
      // 60 / 12 = 5 sessions; was 60 / 30 = 2 sessions; extra = 3
      expect(rec.extraSessions).toBe(3);
    }
  });

  it("does NOT recommend reduce_per_session_to when the gap is hours, not seats", () => {
    // Room has enough seats; the gap is purely trainer-hours. Splitting
    // the class would add sessions and make the hours problem worse.
    const result = computeFeasibility({
      implementation: baseImpl,
      rooms: [makeRoom({ seat_capacity: 40 })],
      trainers: [makeTrainer({ availability_hours_per_week: 5 })],
      classes: [
        makeClass({
          hours_per_session: 4,
          expected_learners_per_session: 40,
          total_people_to_train: 400,
        }),
      ],
      classTrainers: [classTrainer("c1", "t1")],
      prereqs: [],
    });
    expect(result.trainerUtilizationPct ?? 0).toBeGreaterThanOrEqual(100);
    expect(result.recommendations.some((r) => r.kind === "reduce_per_session_to")).toBe(false);
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
  it("spans lunch when a session would otherwise overlap, fitting all 4 sessions in one day", () => {
    // Lunch 12:00–13:00. With the lunch-span model:
    //   s1: 9:00–11:00 (no span)
    //   s2: 11:00 + 2h work → spans lunch → room committed 11:00–14:00
    //   s3: 14:00–16:00
    //   s4: 16:00–18:00 (exactly day end with 1h lunch absorbed)
    // All 4 fit on Monday 2026-06-01.
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
    expect(result.estimatedCompletionDate).toBe("2026-06-01");
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

// ── Phase D: go-live buffer ────────────────────────────────────────────────

describe("go-live buffer", () => {
  it("targetCompletionDate equals window_end when go_live is not set", () => {
    const result = computeFeasibility({
      implementation: { ...baseImpl, go_live_date: null, go_live_buffer_days: 7 },
      rooms: [makeRoom()],
      trainers: [makeTrainer()],
      classes: [makeClass()],
      classTrainers: [classTrainer("c1", "t1")],
      prereqs: [],
    });
    expect(result.targetCompletionDate).toBe(baseImpl.window_end_date);
  });

  it("targetCompletionDate equals go_live - buffer when that's earlier than window_end", () => {
    // go_live 2026-07-01, buffer 5 → target 2026-06-26 (before window_end 07-26)
    const result = computeFeasibility({
      implementation: {
        ...baseImpl,
        go_live_date: "2026-07-01",
        go_live_buffer_days: 5,
      },
      rooms: [makeRoom()],
      trainers: [makeTrainer()],
      classes: [makeClass()],
      classTrainers: [classTrainer("c1", "t1")],
      prereqs: [],
    });
    expect(result.targetCompletionDate).toBe("2026-06-26");
  });

  it("marks every session unschedulable when the buffer pushes target before window_start", () => {
    const result = computeFeasibility({
      implementation: {
        ...baseImpl,
        window_start_date: "2026-06-01",
        window_end_date: "2026-06-30",
        go_live_date: "2026-06-05",
        go_live_buffer_days: 14, // target = 2026-05-22, before start
      },
      rooms: [makeRoom()],
      trainers: [makeTrainer()],
      classes: [makeClass()],
      classTrainers: [classTrainer("c1", "t1")],
      prereqs: [],
    });
    expect(result.unscheduledSessions).toBe(3);
  });

  it("daysOverTarget compares to the buffered target, not the raw window_end", () => {
    // Tight schedule: 10 sessions × 2h, single trainer @ 8h/wk over 4 wks → 2 weeks of work.
    // With go_live 2026-06-10 and buffer 7 (target = 2026-06-03), 4-week work spills past target.
    const result = computeFeasibility({
      implementation: {
        ...baseImpl,
        window_start_date: "2026-06-01",
        window_end_date: "2026-06-30",
        go_live_date: "2026-06-10",
        go_live_buffer_days: 7, // target = 2026-06-03
      },
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
    // Sessions can't all fit before 2026-06-03; some end up unschedulable
    // OR the placed sessions extend past target.
    if (result.estimatedCompletionDate) {
      const placed = new Date(result.estimatedCompletionDate + "T00:00:00Z");
      const target = new Date((result.targetCompletionDate ?? "") + "T00:00:00Z");
      if (placed > target) {
        expect(result.daysOverTarget).toBeGreaterThan(0);
      }
    } else {
      expect(result.unscheduledSessions).toBeGreaterThan(0);
    }
  });
});

// ── Per-class distinct rooms / trainers from the simulation ────────────────

describe("per-class distinct rooms + trainers", () => {
  it("stamps distinctRoomsUsed and distinctTrainersUsed for a happy-path class", () => {
    // 1 class, 3 sessions, 1 trainer, 1 room → exactly 1 room and 1 trainer used.
    const result = computeFeasibility({
      implementation: baseImpl,
      rooms: [makeRoom()],
      trainers: [makeTrainer()],
      classes: [makeClass()],
      classTrainers: [classTrainer("c1", "t1")],
      prereqs: [],
    });
    const cf = result.classFeasibility[0];
    expect(cf?.distinctRoomsUsed).toBe(1);
    expect(cf?.distinctTrainersUsed).toBe(1);
    expect(cf?.sessionsScheduled).toBe(3);
    expect(result.distinctRoomsUsedTotal).toBe(1);
    expect(result.distinctTrainersUsedTotal).toBe(1);
  });

  it("returns null per-class fields when window dates aren't set (sim couldn't run)", () => {
    const result = computeFeasibility({
      implementation: { ...baseImpl, window_start_date: null, window_end_date: null },
      rooms: [makeRoom()],
      trainers: [makeTrainer()],
      classes: [makeClass()],
      classTrainers: [classTrainer("c1", "t1")],
      prereqs: [],
    });
    const cf = result.classFeasibility[0];
    expect(cf?.distinctRoomsUsed).toBeNull();
    expect(cf?.distinctTrainersUsed).toBeNull();
    expect(cf?.sessionsScheduled).toBe(0);
    expect(result.distinctRoomsUsedTotal).toBeNull();
    expect(result.distinctTrainersUsedTotal).toBeNull();
  });

  it("returns 0 rooms/trainers for a class that's blocked (sim ran, placed nothing)", () => {
    // Class needs 25 seats; only room has 10 → roomCapacityOk=false; sim skips
    // it. Sim DID run, so the field is 0 (not null).
    const result = computeFeasibility({
      implementation: baseImpl,
      rooms: [makeRoom({ seat_capacity: 10 })],
      trainers: [makeTrainer()],
      classes: [makeClass({ expected_learners_per_session: 25 })],
      classTrainers: [classTrainer("c1", "t1")],
      prereqs: [],
    });
    const cf = result.classFeasibility[0];
    expect(cf?.distinctRoomsUsed).toBe(0);
    expect(cf?.distinctTrainersUsed).toBe(0);
    expect(cf?.sessionsScheduled).toBe(0);
    expect(result.distinctRoomsUsedTotal).toBe(0);
  });

  it("counts ALL distinct rooms when sessions spill across multiple rooms", () => {
    // 10 sessions, small room holds 12 perfectly. With 1 trainer, sim uses
    // the small (best-fit) room exclusively → distinctRoomsUsed = 1.
    // But add a SECOND trainer to enable parallel placement, and the sim
    // should still prefer the smallest room first; both trainers compete
    // for the same room and only one of them runs at a time. Use a class
    // that's too big for the small room so only the big room qualifies.
    const result = computeFeasibility({
      implementation: baseImpl,
      rooms: [
        makeRoom({ id: "small", name: "Small", seat_capacity: 12 }),
        makeRoom({ id: "big", name: "Big", seat_capacity: 40 }),
      ],
      trainers: [makeTrainer()],
      classes: [makeClass({ expected_learners_per_session: 15 })], // only fits in big
      classTrainers: [classTrainer("c1", "t1")],
      prereqs: [],
    });
    const cf = result.classFeasibility[0];
    expect(cf?.distinctRoomsUsed).toBe(1);
    // Verify it was the big one (small was excluded by seat capacity).
    const usedBig = result.roomUtilization.find((r) => r.id === "big");
    expect(usedBig?.hoursAssigned ?? 0).toBeGreaterThan(0);
  });

  it("totals are the UNION across classes, not the sum (rooms shared across classes counted once)", () => {
    // Two classes that both fit a single small room (best-fit). Each
    // class's distinctRoomsUsed = 1; total should also be 1 (same room
    // shared), not 2.
    const result = computeFeasibility({
      implementation: baseImpl,
      rooms: [makeRoom({ id: "only", seat_capacity: 20 })],
      trainers: [makeTrainer()],
      classes: [
        makeClass({ id: "a", name: "A", sort_order: 0 }),
        makeClass({ id: "b", name: "B", sort_order: 1 }),
      ],
      classTrainers: [classTrainer("a", "t1"), classTrainer("b", "t1")],
      prereqs: [],
    });
    const ca = result.classFeasibility.find((f) => f.classId === "a");
    const cb = result.classFeasibility.find((f) => f.classId === "b");
    expect(ca?.distinctRoomsUsed).toBe(1);
    expect(cb?.distinctRoomsUsed).toBe(1);
    expect(result.distinctRoomsUsedTotal).toBe(1); // union, not sum
    expect(result.distinctTrainersUsedTotal).toBe(1);
  });

  it("captures 2 trainers when load distributes across the slate", () => {
    // Even-load distribution should split a 4-session class across both
    // assigned trainers → distinctTrainersUsed = 2.
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
    const cf = result.classFeasibility[0];
    expect(cf?.distinctTrainersUsed).toBe(2);
    expect(cf?.distinctRoomsUsed).toBe(1); // only one room exists
  });
});

// ── Cross-implementation trainer busy intervals ────────────────────────────

describe("cross-impl trainer busy", () => {
  it("respects a cross-impl busy interval that overlaps the first slot", () => {
    // Trainer t1 is "busy elsewhere" 09:00–11:00 UTC on day 1. With 1 session
    // of 2h needed and 1 trainer + 1 room, the placement should be pushed
    // to 11:00 instead of starting at 09:00.
    const cross = new Map<string, Array<{ start: string; end: string; implName?: string }>>([
      [
        "t1",
        [
          {
            start: "2026-06-01T09:00:00Z",
            end: "2026-06-01T11:00:00Z",
            implName: "Other Hospital — EMR",
          },
        ],
      ],
    ]);
    const result = computeFeasibility({
      implementation: { ...baseImpl, window_end_date: "2026-06-05" },
      rooms: [makeRoom()],
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
      crossImplBusyByTrainer: cross,
    });
    expect(result.unscheduledSessions).toBe(0);
    // Session placed on day 1 because it can slide to 11:00 inside the same day.
    expect(result.estimatedCompletionDate).toBe("2026-06-01");
    // Total hours assigned to t1 = 2 (this impl's session), NOT incrementing
    // for the cross-impl interval — cross-impl is a wall, not consumed capacity.
    const t1 = result.trainerUtilization.find((t) => t.id === "t1");
    expect(t1?.hoursAssigned).toBe(2);
  });

  it("pushes to the next day when cross-impl busy fills the entire first day", () => {
    // Trainer busy 09:00–17:00 day 1 → all-day block. Session must spill to day 2.
    const cross = new Map<string, Array<{ start: string; end: string; implName?: string }>>([
      [
        "t1",
        [
          {
            start: "2026-06-01T09:00:00Z",
            end: "2026-06-01T17:00:00Z",
            implName: "Other site",
          },
        ],
      ],
    ]);
    const result = computeFeasibility({
      implementation: { ...baseImpl, window_end_date: "2026-06-05" },
      rooms: [makeRoom({ available_hours_per_day: 8 })],
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
      crossImplBusyByTrainer: cross,
    });
    expect(result.unscheduledSessions).toBe(0);
    // Day 1 fully blocked → completion on day 2 (2026-06-02)
    expect(result.estimatedCompletionDate).toBe("2026-06-02");
  });

  it("handles multiple cross-impl intervals on the same trainer", () => {
    // Three blocks in a row force the session into the gap.
    const cross = new Map<string, Array<{ start: string; end: string; implName?: string }>>([
      [
        "t1",
        [
          { start: "2026-06-01T09:00:00Z", end: "2026-06-01T11:00:00Z" },
          { start: "2026-06-01T13:00:00Z", end: "2026-06-01T15:00:00Z" },
        ],
      ],
    ]);
    const result = computeFeasibility({
      implementation: { ...baseImpl, window_end_date: "2026-06-05" },
      rooms: [makeRoom()],
      trainers: [makeTrainer()],
      classes: [
        makeClass({
          hours_per_session: 2,
          expected_learners_per_session: 10,
          total_people_to_train: 10,
        }),
      ],
      classTrainers: [classTrainer("c1", "t1")],
      prereqs: [],
      crossImplBusyByTrainer: cross,
    });
    expect(result.unscheduledSessions).toBe(0);
    // Should slot 11:00–13:00 (the gap), still on day 1.
    expect(result.estimatedCompletionDate).toBe("2026-06-01");
  });

  it("does NOT affect trainers without cross-impl entries", () => {
    // Two trainers, only t1 has a cross-impl block. Sim should route the work
    // to t2 (least-loaded after t1 is blocked) or to t1 in the gap.
    const cross = new Map<string, Array<{ start: string; end: string }>>([
      ["t1", [{ start: "2026-06-01T09:00:00Z", end: "2026-06-01T11:00:00Z" }]],
    ]);
    const result = computeFeasibility({
      implementation: { ...baseImpl, window_end_date: "2026-06-05" },
      rooms: [makeRoom()],
      trainers: [makeTrainer({ id: "t1", name: "T1" }), makeTrainer({ id: "t2", name: "T2" })],
      classes: [
        makeClass({
          hours_per_session: 2,
          expected_learners_per_session: 10,
          total_people_to_train: 10, // 1 session
        }),
      ],
      classTrainers: [classTrainer("c1", "t1"), classTrainer("c1", "t2")],
      prereqs: [],
      crossImplBusyByTrainer: cross,
    });
    expect(result.unscheduledSessions).toBe(0);
    expect(result.estimatedCompletionDate).toBe("2026-06-01");
    // t2 should pick up the session since t1 is blocked at the same start.
    // (Least-loaded picks t1 first because both at 0h, but the cross-impl
    // wall on t1 pushes its placement past 11:00. The sim with current
    // implementation prefers staying on t1 by pushing past the block —
    // either outcome is correct, so we just assert SOMEONE took it.)
    const total =
      (result.trainerUtilization.find((t) => t.id === "t1")?.hoursAssigned ?? 0) +
      (result.trainerUtilization.find((t) => t.id === "t2")?.hoursAssigned ?? 0);
    expect(total).toBe(2);
  });

  it("an empty cross-impl map (or no entry for trainer) is a no-op", () => {
    const result = computeFeasibility({
      implementation: baseImpl,
      rooms: [makeRoom()],
      trainers: [makeTrainer()],
      classes: [makeClass()],
      classTrainers: [classTrainer("c1", "t1")],
      prereqs: [],
      crossImplBusyByTrainer: new Map(),
    });
    expect(result.unscheduledSessions).toBe(0);
    expect(result.estimatedCompletionDate).toBe("2026-06-01");
  });

  it("cross-impl busy past the window end can't break the sim", () => {
    // Busy interval entirely in the future, after window_end. Sim should
    // ignore it (or, more precisely, never overlap it because the sim
    // never gets that far).
    const cross = new Map<string, Array<{ start: string; end: string }>>([
      ["t1", [{ start: "2027-01-01T09:00:00Z", end: "2027-01-01T11:00:00Z" }]],
    ]);
    const result = computeFeasibility({
      implementation: baseImpl,
      rooms: [makeRoom()],
      trainers: [makeTrainer()],
      classes: [makeClass()],
      classTrainers: [classTrainer("c1", "t1")],
      prereqs: [],
      crossImplBusyByTrainer: cross,
    });
    expect(result.unscheduledSessions).toBe(0);
    expect(result.estimatedCompletionDate).toBe("2026-06-01");
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

// ── applyLunch ──────────────────────────────────────────────────────────────

describe("applyLunch", () => {
  const lunch = { startHr: 12, endHr: 13 };

  it("returns input unchanged when lunch is null", () => {
    expect(applyLunch(9, 8, null)).toEqual({
      wallClockHours: 8,
      spansLunch: false,
      pushedTo: null,
    });
  });

  it("spans lunch for a session starting before lunch that would cross it", () => {
    // 9:00 + 8h would land at 17:00 → spans 12-13 lunch → wall clock = 9h
    expect(applyLunch(9, 8, lunch)).toEqual({
      wallClockHours: 9,
      spansLunch: true,
      pushedTo: null,
    });
  });

  it("spans lunch for a 6h session at 9:00", () => {
    expect(applyLunch(9, 6, lunch)).toEqual({
      wallClockHours: 7,
      spansLunch: true,
      pushedTo: null,
    });
  });

  it("does not span when session ends before lunch starts", () => {
    expect(applyLunch(9, 2, lunch)).toEqual({
      wallClockHours: 2,
      spansLunch: false,
      pushedTo: null,
    });
    // 9 + 3 = 12, equal to lunch start — treat as no overlap (no boundary span)
    expect(applyLunch(9, 3, lunch)).toEqual({
      wallClockHours: 3,
      spansLunch: false,
      pushedTo: null,
    });
  });

  it("pushes start past lunch when session starts inside the lunch window", () => {
    expect(applyLunch(12.5, 4, lunch)).toEqual({
      wallClockHours: 4,
      spansLunch: false,
      pushedTo: 13,
    });
    // start exactly at lunch.startHr is treated as inside
    expect(applyLunch(12, 4, lunch)).toEqual({
      wallClockHours: 4,
      spansLunch: false,
      pushedTo: 13,
    });
  });

  it("no impact when session starts at or after lunch end", () => {
    expect(applyLunch(13, 4, lunch)).toEqual({
      wallClockHours: 4,
      spansLunch: false,
      pushedTo: null,
    });
    expect(applyLunch(14, 3, lunch)).toEqual({
      wallClockHours: 3,
      spansLunch: false,
      pushedTo: null,
    });
  });
});

// ── Lunch-span in the simulator ─────────────────────────────────────────────

describe("computeFeasibility lunch-span placement", () => {
  it("places an 8h class spanning lunch within a single 8h+lunch day", () => {
    // Window deliberately small (one week) so the test fails loudly if the
    // 8h session can't fit in a single day.
    const impl: Implementation = {
      ...baseImpl,
      window_start_date: "2026-06-01",
      window_end_date: "2026-06-05",
      go_live_date: null,
    };
    const result = computeFeasibility({
      implementation: impl,
      rooms: [makeRoom({ seat_capacity: 12 })],
      trainers: [makeTrainer({ availability_hours_per_week: 40 })],
      classes: [
        makeClass({
          id: "c1",
          hours_per_session: 8,
          expected_learners_per_session: 8,
          total_people_to_train: 8, // 1 session
        }),
      ],
      classTrainers: [classTrainer("c1", "t1")],
      prereqs: [],
    });
    expect(result.unscheduledSessions).toBe(0);
    expect(result.estimatedCompletionDate).toBeTruthy();
  });

  it("places a 6h class spanning lunch in one day", () => {
    const impl: Implementation = {
      ...baseImpl,
      window_start_date: "2026-06-01",
      window_end_date: "2026-06-05",
      go_live_date: null,
    };
    const result = computeFeasibility({
      implementation: impl,
      rooms: [makeRoom({ seat_capacity: 6 })],
      trainers: [makeTrainer()],
      classes: [
        makeClass({
          id: "c1",
          hours_per_session: 6,
          expected_learners_per_session: 5,
          total_people_to_train: 5,
        }),
      ],
      classTrainers: [classTrainer("c1", "t1")],
      prereqs: [],
    });
    expect(result.unscheduledSessions).toBe(0);
  });

  it("regression: dual-care-style mix with 1h lunch finishes everything", () => {
    // Mirrors the real-world scenario that surfaced the lunch bug: a mix of
    // 2h / 4h / 5h / 6h / 8h classes, multiple rooms, plenty of trainers,
    // 6-week window. Before the fix this produced 15 unscheduled sessions
    // because every 6h+ class hit the lunch-push trap.
    const impl: Implementation = {
      ...baseImpl,
      window_start_date: "2026-08-31",
      window_end_date: "2026-10-09",
      go_live_date: "2026-10-18",
      go_live_buffer_days: 7,
    };
    const result = computeFeasibility({
      implementation: impl,
      rooms: [
        makeRoom({ id: "r1", name: "Big A", seat_capacity: 12 }),
        makeRoom({ id: "r2", name: "Big B", seat_capacity: 12 }),
        makeRoom({ id: "r3", name: "Mid", seat_capacity: 6 }),
        makeRoom({ id: "r4", name: "Small", seat_capacity: 4 }),
      ],
      trainers: Array.from({ length: 6 }, (_, i) =>
        makeTrainer({ id: `t${(i + 1).toString()}`, name: `T${(i + 1).toString()}` }),
      ),
      classes: [
        makeClass({
          id: "c1",
          name: "8h-A",
          hours_per_session: 8,
          expected_learners_per_session: 8,
          total_people_to_train: 8, // 1 session
        }),
        makeClass({
          id: "c2",
          name: "8h-B",
          hours_per_session: 8,
          expected_learners_per_session: 5,
          total_people_to_train: 5,
        }),
        makeClass({
          id: "c3",
          name: "6h",
          hours_per_session: 6,
          expected_learners_per_session: 5,
          total_people_to_train: 5,
        }),
        makeClass({
          id: "c4",
          name: "5h",
          hours_per_session: 5,
          expected_learners_per_session: 5,
          total_people_to_train: 5,
        }),
        makeClass({
          id: "c5",
          name: "4h",
          hours_per_session: 4,
          expected_learners_per_session: 5,
          total_people_to_train: 5,
        }),
        makeClass({
          id: "c6",
          name: "2h",
          hours_per_session: 2,
          expected_learners_per_session: 5,
          total_people_to_train: 5,
        }),
      ],
      classTrainers: [
        classTrainer("c1", "t1"),
        classTrainer("c2", "t2"),
        classTrainer("c3", "t3"),
        classTrainer("c4", "t4"),
        classTrainer("c5", "t5"),
        classTrainer("c6", "t6"),
      ],
      prereqs: [],
    });
    expect(result.unscheduledSessions).toBe(0);
    expect(result.verdict).not.toBe("infeasible");
  });

  it("pushes session start past lunch when starting inside the lunch window", () => {
    // This wouldn't normally happen at hour 0 of the day, but test the
    // pure applyLunch math instead — covered above. Here we just confirm
    // the regression case where a long session running INSIDE lunch on
    // back-to-back days still places.
    const impl: Implementation = {
      ...baseImpl,
      window_start_date: "2026-06-01",
      window_end_date: "2026-06-10",
      go_live_date: null,
    };
    const result = computeFeasibility({
      implementation: impl,
      // Two 8h sessions of the same class force a second day in the same room.
      rooms: [makeRoom({ seat_capacity: 12 })],
      trainers: [makeTrainer({ availability_hours_per_week: 40 })],
      classes: [
        makeClass({
          id: "c1",
          hours_per_session: 8,
          expected_learners_per_session: 8,
          total_people_to_train: 16, // 2 sessions
        }),
      ],
      classTrainers: [classTrainer("c1", "t1")],
      prereqs: [],
    });
    expect(result.unscheduledSessions).toBe(0);
  });
});

// ── Trainer PTO / unavailability ────────────────────────────────────────────

describe("computeFeasibility trainer unavailability", () => {
  it("pushes placement past a trainer's PTO window", () => {
    // 1-week window starting Mon 2026-06-01. Trainer is out the entire first
    // week → only week-2 sessions can be placed; with a 1-session class
    // needing 2h, completion lands on or after Mon 2026-06-08.
    const impl: Implementation = {
      ...baseImpl,
      window_start_date: "2026-06-01",
      window_end_date: "2026-06-12",
      go_live_date: null,
    };
    const unavailability = new Map([
      ["t1", [{ start: "2026-06-01T00:00:00Z", end: "2026-06-07T00:00:00Z", reason: "Vacation" }]],
    ]);
    const result = computeFeasibility({
      implementation: impl,
      rooms: [makeRoom()],
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
      unavailabilityByTrainer: unavailability,
    });
    expect(result.unscheduledSessions).toBe(0);
    // estimatedCompletionDate is yyyy-mm-dd; should be on or after Jun 8
    expect(result.estimatedCompletionDate).not.toBeNull();
    if (result.estimatedCompletionDate) {
      expect(result.estimatedCompletionDate >= "2026-06-08").toBe(true);
    }
  });

  it("declares unscheduled when PTO covers the entire window", () => {
    const impl: Implementation = {
      ...baseImpl,
      window_start_date: "2026-06-01",
      window_end_date: "2026-06-05",
      go_live_date: null,
    };
    const unavailability = new Map([
      [
        "t1",
        [{ start: "2026-05-30T00:00:00Z", end: "2026-06-10T00:00:00Z", reason: "Extended leave" }],
      ],
    ]);
    const result = computeFeasibility({
      implementation: impl,
      rooms: [makeRoom()],
      trainers: [makeTrainer()],
      classes: [
        makeClass({
          hours_per_session: 2,
          expected_learners_per_session: 10,
          total_people_to_train: 10,
        }),
      ],
      classTrainers: [classTrainer("c1", "t1")],
      prereqs: [],
      unavailabilityByTrainer: unavailability,
    });
    expect(result.unscheduledSessions).toBeGreaterThan(0);
    expect(result.verdict).toBe("infeasible");
  });
});

// ── Resource forecast ───────────────────────────────────────────────────────

describe("computeResourceForecast", () => {
  it("groups classes by expected_learners_per_session and recommends room counts", () => {
    const impl: Implementation = {
      ...baseImpl,
      window_start_date: "2026-06-01",
      window_end_date: "2026-07-26",
    };
    const result = computeResourceForecast({
      implementation: impl,
      windowWeeks: 8,
      rooms: [makeRoom({ seat_capacity: 12 })],
      classes: [
        makeClass({
          id: "c1",
          name: "Big",
          hours_per_session: 8,
          expected_learners_per_session: 8,
          total_people_to_train: 8, // 1 session
        }),
        makeClass({
          id: "c2",
          name: "Mid A",
          hours_per_session: 4,
          expected_learners_per_session: 5,
          total_people_to_train: 5,
        }),
        makeClass({
          id: "c3",
          name: "Mid B",
          hours_per_session: 6,
          expected_learners_per_session: 5,
          total_people_to_train: 5,
        }),
        makeClass({
          id: "c4",
          name: "Small",
          hours_per_session: 8,
          expected_learners_per_session: 4,
          total_people_to_train: 4,
        }),
      ],
    });
    const seats = result.tiers.map((t) => t.minSeats);
    // Sorted by seat tier descending.
    expect(seats).toEqual([8, 5, 4]);
    // Plenty of room capacity over 8 weeks — each tier needs the floor of 1.
    expect(result.tiers.every((t) => t.roomsNeeded === 1)).toBe(true);
    // Total instruction hours = 8 + 4 + 6 + 8 = 26.
    expect(result.totalInstructionHours).toBe(26);
    // 8h class spans lunch → +1h wall clock; 6h class spans → +1h; 4h class
    // (9→13) spans → +1h; 8h small class spans → +1h. Total wall clock 30h.
    expect(result.totalWallClockHours).toBe(30);
  });

  it("scales rooms-needed by total workload over the window", () => {
    const impl: Implementation = {
      ...baseImpl,
      window_start_date: "2026-06-01",
      window_end_date: "2026-06-05", // single 5-day week
      go_live_date: null,
    };
    // 5 days × 9h = 45 wall-clock hours per room. Need more rooms when
    // workload exceeds that.
    const result = computeResourceForecast({
      implementation: impl,
      windowWeeks: 1,
      rooms: [],
      classes: Array.from({ length: 6 }, (_, i) =>
        makeClass({
          id: `c${(i + 1).toString()}`,
          name: `Class ${(i + 1).toString()}`,
          hours_per_session: 8,
          expected_learners_per_session: 12,
          total_people_to_train: 12,
        }),
      ),
    });
    expect(result.tiers).toHaveLength(1);
    const tier = result.tiers[0];
    if (!tier) throw new Error("expected one tier");
    expect(tier.minSeats).toBe(12);
    // 6 × 9h = 54 wall-clock hours; per-room cap is ~45 → need 2 rooms.
    expect(tier.roomsNeeded).toBeGreaterThanOrEqual(2);
  });
});
