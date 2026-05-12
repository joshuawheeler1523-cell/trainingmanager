// Training Planner — feasibility analysis for the Calculate step.
//
// The greedy SQL generator (supabase/migrations/20260109000002_schedule_generator.sql)
// is the source of truth at run time. This module mirrors its key constraints in
// TypeScript so the planner can see — BEFORE pressing Generate — whether the
// implementation can fit, where the bottleneck is, and what quantitative changes
// would make it fit.
//
// What we model here:
//   - Working days in window per room (intersect with available_days_of_week)
//   - Total trainer-hours required vs. available
//   - Per-class blockers (no eligible room, no trainer slate, etc.)
//   - A lightweight resource-pointer simulation that estimates the completion date
//   - Bottleneck identification (most-utilized trainer / room)
//   - Quantitative recommendations to close any gap
//
// All inputs are read-only. No DB calls. Pure functions, tested independently.

import type {
  Implementation,
  ImplClass,
  ImplRoom,
  ImplTrainer,
  ImplClassTrainer,
  ImplClassPrerequisite,
} from "@arbor/shared";
import { sessionsNeeded } from "@arbor/shared";

// ── Public types ────────────────────────────────────────────────────────────

export type ClassFeasibility = {
  classId: string;
  className: string;
  sessionsNeeded: number;
  hoursPerSession: number;
  totalHoursNeeded: number;
  roomCapacityOk: boolean;
  trainerSlateOk: boolean;
  prereqReachable: boolean;
  blockers: string[];
  // Populated by the simulation when (and only when) the class is reachable.
  // distinctRoomsUsed = unique impl_rooms the sim placed sessions of this
  // class in; distinctTrainersUsed similarly. sessionsScheduled is how many
  // of sessionsNeeded actually fit in the window (sessions that couldn't be
  // placed are counted in FeasibilityResult.unscheduledSessions, not here).
  distinctRoomsUsed: number | null;
  distinctTrainersUsed: number | null;
  sessionsScheduled: number;
};

export type ResourceUtilization = {
  id: string;
  name: string;
  hoursAssigned: number;
  hoursAvailable: number;
  utilizationPct: number;
};

export type Recommendation =
  | { kind: "assign_trainer"; classId: string; className: string }
  | { kind: "add_capacity_room"; minSeats: number; classNames: string[] }
  | { kind: "add_trainers"; count: number; hoursPerWeek: number }
  | { kind: "add_trainer_hours_per_week"; hours: number }
  | { kind: "add_rooms"; count: number }
  | { kind: "extend_window_weeks"; weeks: number }
  | {
      kind: "reduce_per_session_to";
      className: string;
      learners: number;
      extraSessions: number;
    };

export type FeasibilityVerdict = "feasible" | "tight" | "infeasible";

export type ResourceForecastTier = {
  /** Minimum seat capacity required at this tier (= the class's expected_learners_per_session). */
  minSeats: number;
  /** Class names whose sessions land in this tier. */
  classNames: string[];
  /** Total wall-clock session-hours that must be placed in rooms of this tier or larger. */
  sessionHoursWallClock: number;
  /** Minimum rooms with ≥minSeats needed to absorb this tier's load (floor 1). */
  roomsNeeded: number;
};

export type ResourceForecast = {
  /** Per-seat-tier room requirements, sorted by minSeats descending (largest first). */
  tiers: ResourceForecastTier[];
  /** Sum of instructional hours across all classes (matches totalTrainerHoursNeeded). */
  totalInstructionHours: number;
  /** Sum of wall-clock session-hours (instruction + lunch when spanning). */
  totalWallClockHours: number;
  /** Minimum trainer headcount assuming each works fteHoursPerWeek over the window. */
  trainersNeeded: number;
  /** Reference figure used to translate trainer-hours to headcount (40h/wk default). */
  fteHoursPerWeek: number;
  /** Working days in window (Mon–Fri intersect with window dates). */
  workingDays: number;
  /** Weeks in window. */
  weeks: number;
  /** Effective room hours per working day (room-hours + lunch length when lunch falls inside). */
  effectiveHoursPerDay: number;
};

export type FeasibilityResult = {
  verdict: FeasibilityVerdict;
  windowDays: number;
  windowWeeks: number;
  totalSessionsNeeded: number;
  totalTrainerHoursNeeded: number;
  totalTrainerHoursAvailable: number;
  totalRoomHoursAvailable: number;
  trainerUtilizationPct: number | null;
  roomUtilizationPct: number | null;
  classFeasibility: ClassFeasibility[];
  trainerUtilization: ResourceUtilization[];
  roomUtilization: ResourceUtilization[];
  estimatedCompletionDate: string | null; // ISO YYYY-MM-DD; null if any class unschedulable
  targetCompletionDate: string | null; // go_live - buffer, or window_end if go_live unset
  unscheduledSessions: number;
  daysOverTarget: number; // simulated - target (0 if on or under)
  // Union of all distinct rooms / trainers the sim actually used across all
  // classes. Null when the simulation couldn't run (no window dates, etc.).
  distinctRoomsUsedTotal: number | null;
  distinctTrainersUsedTotal: number | null;
  recommendations: Recommendation[];
  /**
   * Resource forecast — what you need at minimum to make this implementation
   * fit, independent of what rooms/trainers you've already entered. Tiers are
   * grouped by class.expected_learners_per_session so the planner can see
   * "buy/book 2 rooms with ≥12 seats, 1 with ≥6 seats" before scheduling.
   */
  resourceForecast: ResourceForecast;
  ready: boolean;
  readyBlockers: string[]; // global reasons Generate is disabled
};

// ── Helpers ────────────────────────────────────────────────────────────────

const MS_PER_DAY = 86400000;

function parseUtcDate(s: string): Date {
  return new Date(s + "T00:00:00Z");
}

function fmtDate(d: Date): string {
  const y = d.getUTCFullYear().toString();
  const m = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = d.getUTCDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function weekKey(d: Date): string {
  // ISO week starts Monday. Trunc to Monday of d's week.
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const offset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + offset);
  return fmtDate(monday);
}

/** Subset check: every tag in `required` appears in `available`. */
function tagsContainAll(available: string[], required: string[]): boolean {
  if (required.length === 0) return true;
  const set = new Set(available);
  for (const t of required) if (!set.has(t)) return false;
  return true;
}

function tagSetContainsAll(available: Set<string>, required: string[]): boolean {
  if (required.length === 0) return true;
  for (const t of required) if (!available.has(t)) return false;
  return true;
}

/**
 * Count days in [startDate, endDate] (inclusive) whose day-of-week is in
 * the given set. dayOfWeek follows JS convention: 0=Sun..6=Sat (matches
 * Postgres EXTRACT(DOW)).
 */
export function workingDaysInWindow(
  startDate: string,
  endDate: string,
  daysOfWeek: number[],
): number {
  if (!startDate || !endDate) return 0;
  const start = parseUtcDate(startDate);
  const end = parseUtcDate(endDate);
  if (end < start) return 0;
  const set = new Set(daysOfWeek);
  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    if (set.has(cursor.getUTCDay())) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

/**
 * Total weeks in window (rounded up, min 1 when window is at least 1 day).
 * Used for trainer weekly-hours × weeks math.
 */
export function windowWeeks(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 0;
  const start = parseUtcDate(startDate);
  const end = parseUtcDate(endDate);
  if (end < start) return 0;
  const days = Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;
  return Math.max(1, Math.ceil(days / 7));
}

// ── Topological sort for prereq DAG ─────────────────────────────────────────

function topologicalOrder(classes: ImplClass[], prereqs: ImplClassPrerequisite[]): ImplClass[] {
  // Kahn's algorithm. Stable on (depth, sort_order, created_at) for
  // determinism that matches the SQL generator's CTE.
  const inDeg = new Map<string, number>();
  const out = new Map<string, string[]>(); // prereq → [classes that depend on it]
  for (const c of classes) inDeg.set(c.id, 0);
  for (const p of prereqs) {
    if (!inDeg.has(p.impl_class_id) || !inDeg.has(p.prerequisite_id)) continue;
    inDeg.set(p.impl_class_id, (inDeg.get(p.impl_class_id) ?? 0) + 1);
    const list = out.get(p.prerequisite_id) ?? [];
    list.push(p.impl_class_id);
    out.set(p.prerequisite_id, list);
  }

  const byId = new Map(classes.map((c) => [c.id, c]));
  const sortKey = (c: ImplClass): string =>
    `${c.sort_order.toString().padStart(10, "0")}|${c.created_at}|${c.id}`;

  const ready: ImplClass[] = classes
    .filter((c) => (inDeg.get(c.id) ?? 0) === 0)
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

  const result: ImplClass[] = [];
  while (ready.length > 0) {
    // Pick the lowest-sort element. ready is kept sorted by sortKey.
    const next = ready.shift();
    if (!next) break;
    result.push(next);
    for (const dep of out.get(next.id) ?? []) {
      const d = inDeg.get(dep) ?? 0;
      inDeg.set(dep, d - 1);
      if (d - 1 === 0) {
        const cls = byId.get(dep);
        if (cls) {
          // Insertion-sort
          const idx = ready.findIndex((x) => sortKey(x) > sortKey(cls));
          if (idx === -1) ready.push(cls);
          else ready.splice(idx, 0, cls);
        }
      }
    }
  }

  // If a cycle slipped through (shouldn't — DB trigger prevents it),
  // append remaining classes at the end to avoid losing them.
  if (result.length < classes.length) {
    const seen = new Set(result.map((c) => c.id));
    for (const c of classes) if (!seen.has(c.id)) result.push(c);
  }
  return result;
}

// ── Per-class feasibility ──────────────────────────────────────────────────

/**
 * For a single class, determine whether it can in principle be scheduled
 * given the org's room/trainer roster. Does NOT check time-slot conflicts
 * — that's the simulation's job.
 */
function classFeasibilityRow(
  c: ImplClass,
  rooms: ImplRoom[],
  trainerIdsInSlate: string[],
  trainers: ImplTrainer[],
  reachablePrereqIds: Set<string>,
  prereqIdsForThis: string[],
): ClassFeasibility {
  const blockers: string[] = [];
  const sn = sessionsNeeded(c);
  const totalHours = sn * c.hours_per_session;

  // Room capacity: at least one room with enough seats, at least one open day,
  // and an equipment-tag superset for the class's required set.
  const roomCapacityOk = rooms.some(
    (r) =>
      r.seat_capacity >= c.expected_learners_per_session &&
      r.available_days_of_week.length > 0 &&
      tagsContainAll(r.equipment_tags, c.required_equipment_tags),
  );
  if (!roomCapacityOk) {
    if (rooms.length === 0) {
      blockers.push("No rooms defined.");
    } else if (!rooms.some((r) => r.seat_capacity >= c.expected_learners_per_session)) {
      blockers.push(`No room with ${c.expected_learners_per_session.toString()}+ seats.`);
    } else if (c.required_equipment_tags.length > 0) {
      blockers.push(
        `No room has all required equipment (${c.required_equipment_tags.join(", ")}).`,
      );
    } else {
      blockers.push("No eligible room.");
    }
  }

  // Trainer slate: ≥1 trainer assigned with non-zero availability
  const slateTrainers = trainers.filter((t) => trainerIdsInSlate.includes(t.id));
  const trainerSlateOk =
    slateTrainers.length > 0 && slateTrainers.some((t) => t.availability_hours_per_week > 0);
  if (!trainerSlateOk) {
    if (slateTrainers.length === 0) {
      blockers.push("No trainers assigned to this class.");
    } else {
      blockers.push("Assigned trainers have 0 weekly availability.");
    }
  }

  // Prereq reachability: each prereq must itself be reachable (transitively).
  // We're given the set already-marked-reachable from a topological pass.
  const prereqReachable = prereqIdsForThis.every((pid) => reachablePrereqIds.has(pid));
  if (!prereqReachable) {
    blockers.push("A prerequisite class can't be scheduled.");
  }

  return {
    classId: c.id,
    className: c.name,
    sessionsNeeded: sn,
    hoursPerSession: c.hours_per_session,
    totalHoursNeeded: totalHours,
    roomCapacityOk,
    trainerSlateOk,
    prereqReachable,
    blockers,
    // Populated by the simulation pass below — start null so callers can
    // distinguish "sim didn't run" from "sim ran, no rooms used".
    distinctRoomsUsed: null,
    distinctTrainersUsed: null,
    sessionsScheduled: 0,
  };
}

// ── Resource-pointer simulation ─────────────────────────────────────────────
//
// A simplified mirror of the SQL greedy generator. For each session of each
// class (topological order):
//   1. Earliest start = max(window_start, prereq earliest end)
//   2. Pick best-fit room (smallest seat_capacity ≥ per_session); pointer
//      = max(room.next_free, earliest_start)
//   3. Pick least-loaded eligible trainer (by total assigned hours); pointer
//      = max(trainer.next_free, room pointer)
//   4. Snap to a working day where the room is open (intersect with room's
//      available_days_of_week)
//   5. Snap to 09:00 of that day (Phase A — Phase C will respect business hours)
//   6. End = start + hours_per_session
//   7. Check trainer weekly hours; if exceeded, advance to next week
//   8. Commit: trainer.next_free = end, room.next_free = end,
//      trainer.weekly_hours[week] += hours_per_session
//
// Returns per-resource utilization and the latest session end date.

type TrainerState = {
  id: string;
  name: string;
  daysOfWeek: Set<number>; // intersection of available days across rooms
  hoursPerWeek: number;
  hoursAssigned: number;
  maxConcurrent: number;
  weeklyUsed: Map<string, number>;
  nextFree: Date;
  // Cross-impl busy intervals — published sessions in OTHER implementations
  // where this person teaches (matched by instructor_id server-side). The
  // sim treats overlapping placements as if this trainer were booked.
  crossImplBusy: Array<{ start: Date; end: Date; label?: string }>;
};

type RoomState = {
  id: string;
  name: string;
  seatCapacity: number;
  hoursPerDay: number;
  startHourLocal: number;
  daysOfWeek: Set<number>;
  equipmentTags: Set<string>;
  hoursAssigned: number;
  nextFree: Date;
};

type LunchWindow = { startHr: number; endHr: number } | null;

/**
 * Compute how a session interacts with the lunch window when starting at
 * `startHr` for `hours` of instruction time.
 *
 *   - Starts strictly before lunch and would extend into or past lunch
 *     ⇒ session "spans" lunch. Wall-clock duration = hours + lunch length.
 *     The class runs in two halves bracketing the break; total instruction
 *     time is still `hours`, but the resource (room + trainer) is committed
 *     for the extra lunch interval.
 *   - Starts inside the lunch window (start ≥ lunch.start and < lunch.end)
 *     ⇒ push start to lunch.end. Wall-clock = hours.
 *   - Otherwise (starts at or after lunch end, or fully before lunch with
 *     no overlap) ⇒ no impact. Wall-clock = hours.
 *
 * `pushedTo` is non-null only for the second case. Callers should re-snap
 * to that hour before commit; `wallClockHours` is the elapsed clock time
 * actually used by the session for occupancy bookkeeping.
 */
export function applyLunch(
  startHr: number,
  hours: number,
  lunch: LunchWindow,
): { wallClockHours: number; spansLunch: boolean; pushedTo: number | null } {
  if (!lunch) return { wallClockHours: hours, spansLunch: false, pushedTo: null };
  if (startHr >= lunch.startHr && startHr < lunch.endHr) {
    return { wallClockHours: hours, spansLunch: false, pushedTo: lunch.endHr };
  }
  if (startHr < lunch.startHr && startHr + hours > lunch.startHr) {
    return {
      wallClockHours: hours + (lunch.endHr - lunch.startHr),
      spansLunch: true,
      pushedTo: null,
    };
  }
  return { wallClockHours: hours, spansLunch: false, pushedTo: null };
}

function pickBestFitRoom(rooms: RoomState[], perSession: number): RoomState | null {
  // Best-fit = smallest seat_capacity that meets demand. Leaves larger
  // rooms free for larger classes. The cost is that a session may wait
  // for the small room while a larger one sits idle, but with one trainer
  // bottlenecking the per-class loop that wait is usually free.
  let best: RoomState | null = null;
  for (const r of rooms) {
    if (r.seatCapacity < perSession) continue;
    if (r.daysOfWeek.size === 0) continue;
    if (!best || r.seatCapacity < best.seatCapacity) best = r;
  }
  return best;
}

function pickLeastLoadedTrainer(
  trainers: TrainerState[],
  earliest: Date,
  hoursPerSession: number,
): TrainerState | null {
  let best: TrainerState | null = null;
  for (const t of trainers) {
    // Trainer must have working day overlap and a non-zero weekly cap
    if (t.daysOfWeek.size === 0) continue;
    if (t.hoursPerWeek <= 0) continue;
    // Skip trainers whose weekly hours-used + this session would already
    // exceed cap for EVERY week from now to forever — i.e., they're useless.
    // (We don't know the week yet, so trust the loop to handle it.)
    if (!best) {
      best = t;
      continue;
    }
    if (t.hoursAssigned < best.hoursAssigned) {
      best = t;
    } else if (t.hoursAssigned === best.hoursAssigned && t.nextFree < best.nextFree) {
      best = t;
    }
  }
  // We don't strictly need earliest/hoursPerSession here, but accept them
  // for future tuning (e.g., consider per-week remaining).
  void earliest;
  void hoursPerSession;
  return best;
}

function snapToWorkingDay(
  t: Date,
  daysOfWeek: Set<number>,
  windowEnd: Date,
  startHourLocal: number,
): Date | null {
  // Advance cursor forward until it lands on a working day. If cursor is
  // already on a working day and its hour is >= startHourLocal, keep it
  // (sessions stack back-to-back inside the same day). If hour <
  // startHourLocal, snap up to start same day. End-of-day overflow is
  // handled by the caller's room daily-hours check, not here.
  const cursor = new Date(t);
  for (let i = 0; i < 366; i++) {
    if (cursor > windowEnd) return null;
    if (daysOfWeek.has(cursor.getUTCDay())) {
      const hour = cursor.getUTCHours() + cursor.getUTCMinutes() / 60;
      if (hour < startHourLocal) setHourOfDay(cursor, startHourLocal);
      return cursor;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    setHourOfDay(cursor, startHourLocal);
  }
  return null;
}

function setHourOfDay(d: Date, hourLocal: number): void {
  const hours = Math.floor(hourLocal);
  const minutes = Math.round((hourLocal - hours) * 60);
  d.setUTCHours(hours, minutes, 0, 0);
}

// ── Main entry ─────────────────────────────────────────────────────────────

/**
 * Cross-implementation busy interval keyed by this impl's trainer id. The
 * server pre-computes per-trainer busy windows by joining published
 * sessions in OTHER live implementations whose trainer rows link to the
 * same instructor_id, then mapping back to THIS impl's trainer id. The
 * sim treats each interval as if the trainer were already booked, so the
 * Calculate preview matches what the SQL generator will produce on
 * Generate (which has the same pre-seed logic in pg_temp.tmp_busy_trainer).
 */
export type CrossImplBusy = {
  start: string; // ISO timestamptz
  end: string; // ISO timestamptz
  implName?: string;
  className?: string;
};

export function computeFeasibility(input: {
  implementation: Implementation;
  rooms: ImplRoom[];
  trainers: ImplTrainer[];
  classes: ImplClass[];
  classTrainers: ImplClassTrainer[];
  prereqs: ImplClassPrerequisite[];
  crossImplBusyByTrainer?: Map<string, CrossImplBusy[]>;
}): FeasibilityResult {
  const {
    implementation: impl,
    rooms,
    trainers,
    classes,
    classTrainers,
    prereqs,
    crossImplBusyByTrainer,
  } = input;

  // ── Window math
  const windowDays =
    impl.window_start_date && impl.window_end_date
      ? Math.floor(
          (parseUtcDate(impl.window_end_date).getTime() -
            parseUtcDate(impl.window_start_date).getTime()) /
            MS_PER_DAY,
        ) + 1
      : 0;
  const wWeeks =
    impl.window_start_date && impl.window_end_date
      ? windowWeeks(impl.window_start_date, impl.window_end_date)
      : 0;

  // ── Maps
  const trainersByClass = new Map<string, string[]>();
  for (const ct of classTrainers) {
    const list = trainersByClass.get(ct.impl_class_id) ?? [];
    list.push(ct.impl_trainer_id);
    trainersByClass.set(ct.impl_class_id, list);
  }
  const prereqsByClass = new Map<string, string[]>();
  for (const p of prereqs) {
    const list = prereqsByClass.get(p.impl_class_id) ?? [];
    list.push(p.prerequisite_id);
    prereqsByClass.set(p.impl_class_id, list);
  }

  // ── Per-class feasibility (topological pass: a class is reachable iff
  //    all its prereqs are reachable)
  const ordered = topologicalOrder(classes, prereqs);
  const reachable = new Set<string>();
  const classFeas: ClassFeasibility[] = [];
  for (const c of ordered) {
    const slate = trainersByClass.get(c.id) ?? [];
    const myPrereqs = prereqsByClass.get(c.id) ?? [];
    const row = classFeasibilityRow(c, rooms, slate, trainers, reachable, myPrereqs);
    classFeas.push(row);
    if (row.roomCapacityOk && row.trainerSlateOk && row.prereqReachable) {
      reachable.add(c.id);
    }
  }
  // Re-sort classFeas to match the input order for stable rendering.
  const inputOrder = new Map(classes.map((c, i) => [c.id, i]));
  classFeas.sort((a, b) => (inputOrder.get(a.classId) ?? 0) - (inputOrder.get(b.classId) ?? 0));

  // ── Aggregate hours
  const totalSessions = classes.reduce((acc, c) => acc + sessionsNeeded(c), 0);
  const totalTrainerHoursNeeded = classes.reduce(
    (acc, c) => acc + sessionsNeeded(c) * c.hours_per_session,
    0,
  );

  // Per-trainer effective capacity = hours_per_week × weeks. (Phase A treats
  // weeks as windowWeeks — Phase C/D will refine when business-hours land.)
  const totalTrainerHoursAvailable = trainers.reduce(
    (acc, t) => acc + t.availability_hours_per_week * wWeeks,
    0,
  );
  // Per-room effective capacity = hours_per_day × working_days_in_window.
  const totalRoomHoursAvailable = rooms.reduce((acc, r) => {
    const wd =
      impl.window_start_date && impl.window_end_date
        ? workingDaysInWindow(
            impl.window_start_date,
            impl.window_end_date,
            r.available_days_of_week,
          )
        : 0;
    return acc + r.available_hours_per_day * wd;
  }, 0);

  const trainerUtilizationPct =
    totalTrainerHoursAvailable > 0
      ? (totalTrainerHoursNeeded / totalTrainerHoursAvailable) * 100
      : null;
  const roomUtilizationPct =
    totalRoomHoursAvailable > 0 ? (totalTrainerHoursNeeded / totalRoomHoursAvailable) * 100 : null;

  // ── Simulation
  const sim = simulate({
    impl,
    rooms,
    trainers,
    classes: ordered,
    classFeasibility: classFeas,
    trainersByClass,
    prereqsByClass,
    ...(crossImplBusyByTrainer ? { crossImplBusyByTrainer } : {}),
  });

  // Stamp per-class sim results back onto the feasibility rows so the UI
  // can render distinct-rooms-used and distinct-trainers-used alongside
  // the static blocker flags. When the sim didn't run, leave the fields
  // null so callers fall back to the FTE estimate.
  if (sim.simRan) {
    for (const cf of classFeas) {
      const roomsUsed = sim.roomsByClass.get(cf.classId);
      const trainersUsed = sim.trainersByClassUsed.get(cf.classId);
      cf.distinctRoomsUsed = roomsUsed ? roomsUsed.size : 0;
      cf.distinctTrainersUsed = trainersUsed ? trainersUsed.size : 0;
      cf.sessionsScheduled = sim.sessionsScheduledByClass.get(cf.classId) ?? 0;
    }
  }
  const distinctRoomsUsedTotal = sim.simRan ? unionSize([...sim.roomsByClass.values()]) : null;
  const distinctTrainersUsedTotal = sim.simRan
    ? unionSize([...sim.trainersByClassUsed.values()])
    : null;

  // ── Recommendations
  const recommendations = buildRecommendations({
    classes,
    classFeas,
    rooms,
    trainers,
    totalTrainerHoursNeeded,
    totalTrainerHoursAvailable,
    totalRoomHoursAvailable,
    trainerUtilizationPct,
    roomUtilizationPct,
    windowWeeks: wWeeks,
    sim,
  });

  // ── Verdict + ready
  const overallBlockers: string[] = [];
  if (rooms.length === 0) overallBlockers.push("Add at least one room.");
  if (trainers.length === 0) overallBlockers.push("Add at least one trainer.");
  if (classes.length === 0) overallBlockers.push("Add at least one class.");
  const blockedClasses = classFeas.filter((cf) => cf.blockers.length > 0);
  if (blockedClasses.length > 0) {
    overallBlockers.push(
      `${blockedClasses.length.toString()} class${blockedClasses.length === 1 ? "" : "es"} can't be scheduled — see table below.`,
    );
  }

  let verdict: FeasibilityVerdict = "feasible";
  if (
    overallBlockers.length > 0 ||
    sim.unscheduledSessions > 0 ||
    (trainerUtilizationPct !== null && trainerUtilizationPct >= 100) ||
    (roomUtilizationPct !== null && roomUtilizationPct >= 100)
  ) {
    verdict = "infeasible";
  } else if (
    (trainerUtilizationPct !== null && trainerUtilizationPct >= 80) ||
    (roomUtilizationPct !== null && roomUtilizationPct >= 80)
  ) {
    verdict = "tight";
  }

  const ready =
    overallBlockers.length === 0 && rooms.length > 0 && trainers.length > 0 && classes.length > 0;

  const resourceForecast = computeResourceForecast({
    implementation: impl,
    classes,
    rooms,
    windowWeeks: wWeeks,
  });

  return {
    verdict,
    windowDays,
    windowWeeks: wWeeks,
    totalSessionsNeeded: totalSessions,
    totalTrainerHoursNeeded,
    totalTrainerHoursAvailable,
    totalRoomHoursAvailable,
    trainerUtilizationPct,
    roomUtilizationPct,
    classFeasibility: classFeas,
    trainerUtilization: sim.trainerUtilization,
    roomUtilization: sim.roomUtilization,
    estimatedCompletionDate: sim.estimatedCompletionDate,
    targetCompletionDate: sim.targetCompletionDate,
    unscheduledSessions: sim.unscheduledSessions,
    daysOverTarget: sim.daysOverTarget,
    distinctRoomsUsedTotal,
    distinctTrainersUsedTotal,
    recommendations,
    resourceForecast,
    ready,
    readyBlockers: overallBlockers,
  };
}

// ── Resource forecast ──────────────────────────────────────────────────────
//
// Independent of the rooms/trainers entered for the impl — answers "what
// resources do I need to even attempt this?" Drives a UI panel that helps
// planners pre-book rooms and request trainer headcount before scheduling.

export function computeResourceForecast(input: {
  implementation: Implementation;
  classes: ImplClass[];
  rooms: ImplRoom[];
  windowWeeks: number;
}): ResourceForecast {
  const { implementation: impl, classes, rooms, windowWeeks: wWeeks } = input;

  // Default to a standard 8-hour Mon–Fri day if no rooms exist yet; otherwise
  // use the longest available_hours_per_day from existing rooms (the typical
  // ceiling) and the union of available_days_of_week so the forecast tracks
  // the planner's actual operating schedule.
  const defaultDays = [1, 2, 3, 4, 5];
  const daysOfWeek =
    rooms.length > 0
      ? Array.from(new Set(rooms.flatMap((r) => r.available_days_of_week)))
      : defaultDays;
  const hoursPerDay =
    rooms.length > 0 ? Math.max(...rooms.map((r) => r.available_hours_per_day)) : 8;

  const workingDays =
    impl.window_start_date && impl.window_end_date
      ? workingDaysInWindow(impl.window_start_date, impl.window_end_date, daysOfWeek)
      : 0;

  const lunchActive = impl.lunch_break_length_minutes > 0;
  const lunchLengthHr = impl.lunch_break_length_minutes / 60;
  const lunchStartHr = impl.lunch_break_start_minutes / 60;
  // Assume a typical start hour (9:00 if no rooms entered, else earliest room
  // start). This mirrors how the simulator assigns the first slot of the day.
  const dayStartHr = rooms.length > 0 ? Math.min(...rooms.map((r) => r.start_hour_local)) : 9;

  function wallClockForSession(hours: number): number {
    if (!lunchActive) return hours;
    if (dayStartHr < lunchStartHr && dayStartHr + hours > lunchStartHr) {
      return hours + lunchLengthHr;
    }
    return hours;
  }

  const effectiveHoursPerDay =
    hoursPerDay +
    (lunchActive && lunchStartHr >= dayStartHr && lunchStartHr < dayStartHr + hoursPerDay
      ? lunchLengthHr
      : 0);

  const tierMap = new Map<number, { sessionHoursWallClock: number; classNames: string[] }>();
  let totalInstructionHours = 0;
  let totalWallClockHours = 0;

  for (const c of classes) {
    const sessions = sessionsNeeded(c);
    if (sessions === 0) continue;
    const instr = sessions * c.hours_per_session;
    const wallClock = sessions * wallClockForSession(c.hours_per_session);
    totalInstructionHours += instr;
    totalWallClockHours += wallClock;

    const tier = c.expected_learners_per_session;
    const entry = tierMap.get(tier) ?? { sessionHoursWallClock: 0, classNames: [] };
    entry.sessionHoursWallClock += wallClock;
    entry.classNames.push(c.name);
    tierMap.set(tier, entry);
  }

  const roomCapacityPerWindow = workingDays * effectiveHoursPerDay;
  const tiers: ResourceForecastTier[] = [...tierMap.entries()]
    .map(([minSeats, stats]) => ({
      minSeats,
      classNames: stats.classNames,
      sessionHoursWallClock: stats.sessionHoursWallClock,
      roomsNeeded:
        roomCapacityPerWindow > 0
          ? Math.max(1, Math.ceil(stats.sessionHoursWallClock / roomCapacityPerWindow))
          : stats.sessionHoursWallClock > 0
            ? 1
            : 0,
    }))
    .sort((a, b) => b.minSeats - a.minSeats);

  const fteHoursPerWeek = 40;
  const trainersNeeded =
    wWeeks > 0 ? Math.ceil(totalInstructionHours / (fteHoursPerWeek * wWeeks)) : 0;

  return {
    tiers,
    totalInstructionHours,
    totalWallClockHours,
    trainersNeeded,
    fteHoursPerWeek,
    workingDays,
    weeks: wWeeks,
    effectiveHoursPerDay,
  };
}

function unionSize(sets: Set<string>[]): number {
  const union = new Set<string>();
  for (const s of sets) for (const x of s) union.add(x);
  return union.size;
}

// ── Simulation impl ─────────────────────────────────────────────────────────

type SimResult = {
  estimatedCompletionDate: string | null;
  targetCompletionDate: string | null;
  unscheduledSessions: number;
  daysOverTarget: number;
  trainerUtilization: ResourceUtilization[];
  roomUtilization: ResourceUtilization[];
  // Per-class assignment maps. Empty when the sim couldn't run (window
  // unset). When the sim ran, an entry is present for every class even if
  // it had 0 sessions scheduled (so callers can disambiguate "no sim run"
  // from "ran, placed nothing").
  roomsByClass: Map<string, Set<string>>;
  trainersByClassUsed: Map<string, Set<string>>;
  sessionsScheduledByClass: Map<string, number>;
  simRan: boolean;
};

function simulate(args: {
  impl: Implementation;
  rooms: ImplRoom[];
  trainers: ImplTrainer[];
  classes: ImplClass[];
  classFeasibility: ClassFeasibility[];
  trainersByClass: Map<string, string[]>;
  prereqsByClass: Map<string, string[]>;
  crossImplBusyByTrainer?: Map<string, CrossImplBusy[]>;
}): SimResult {
  const {
    impl,
    rooms,
    trainers,
    classes,
    classFeasibility,
    trainersByClass,
    prereqsByClass,
    crossImplBusyByTrainer,
  } = args;

  if (!impl.window_start_date || !impl.window_end_date) {
    return emptySim(rooms, trainers);
  }
  const windowStart = parseUtcDate(impl.window_start_date);
  windowStart.setUTCHours(0, 0, 0, 0);
  const windowEnd = parseUtcDate(impl.window_end_date);
  windowEnd.setUTCHours(23, 59, 59, 999);

  // Target completion = the earlier of window_end and (go_live - buffer).
  // The generator clamps scheduling to this date; we mirror that so the
  // sim's "days over target" matches what the SQL would produce.
  let targetEnd = new Date(windowEnd);
  if (impl.go_live_date) {
    const goLive = parseUtcDate(impl.go_live_date);
    goLive.setUTCDate(goLive.getUTCDate() - impl.go_live_buffer_days);
    goLive.setUTCHours(23, 59, 59, 999);
    if (goLive < targetEnd) targetEnd = goLive;
  }
  // If the buffer pushes the target before window_start, every session
  // becomes unschedulable — clamp to window_start so the loop terminates.
  if (targetEnd < windowStart) {
    targetEnd = new Date(windowStart);
    targetEnd.setUTCDate(targetEnd.getUTCDate() - 1);
  }

  const lunch: LunchWindow =
    impl.lunch_break_length_minutes > 0
      ? {
          startHr: impl.lunch_break_start_minutes / 60,
          endHr: (impl.lunch_break_start_minutes + impl.lunch_break_length_minutes) / 60,
        }
      : null;

  const roomState = new Map<string, RoomState>(
    rooms.map((r) => {
      const start = new Date(windowStart);
      setHourOfDay(start, r.start_hour_local);
      return [
        r.id,
        {
          id: r.id,
          name: r.name,
          seatCapacity: r.seat_capacity,
          hoursPerDay: r.available_hours_per_day,
          startHourLocal: r.start_hour_local,
          daysOfWeek: new Set(r.available_days_of_week),
          equipmentTags: new Set(r.equipment_tags),
          hoursAssigned: 0,
          nextFree: start,
        },
      ];
    }),
  );
  const trainerState = new Map<string, TrainerState>(
    trainers.map((t) => {
      const start = new Date(windowStart);
      // Use earliest room start as the trainer's day starts there too. If no
      // rooms exist (degenerate state) default to 09:00.
      const earliestRoomStart =
        rooms.length > 0 ? Math.min(...rooms.map((r) => r.start_hour_local)) : 9;
      setHourOfDay(start, earliestRoomStart);
      const crossBusy = (crossImplBusyByTrainer?.get(t.id) ?? [])
        .map((b) => {
          const label =
            b.implName && b.className
              ? `${b.className} (${b.implName})`
              : (b.implName ?? b.className);
          return {
            start: new Date(b.start),
            end: new Date(b.end),
            ...(label ? { label } : {}),
          };
        })
        // Sort by start so the placement check can scan linearly.
        .sort((a, b) => a.start.getTime() - b.start.getTime());
      return [
        t.id,
        {
          id: t.id,
          name: t.name,
          daysOfWeek: new Set(rooms.flatMap((r) => r.available_days_of_week)),
          hoursPerWeek: t.availability_hours_per_week,
          hoursAssigned: 0,
          nextFree: start,
          weeklyUsed: new Map(),
          maxConcurrent: t.max_concurrent_sessions,
          crossImplBusy: crossBusy,
        },
      ];
    }),
  );

  const lastSessionEndByClass = new Map<string, Date>();
  const roomsByClass = new Map<string, Set<string>>();
  const trainersByClassUsed = new Map<string, Set<string>>();
  const sessionsScheduledByClass = new Map<string, number>();
  // Seed every class with empty sets so consumers can distinguish "sim
  // didn't run" (map absent) from "sim ran, class placed zero sessions"
  // (map present, set empty).
  for (const c of classes) {
    roomsByClass.set(c.id, new Set());
    trainersByClassUsed.set(c.id, new Set());
    sessionsScheduledByClass.set(c.id, 0);
  }
  let latestEnd: Date | null = null;
  let unscheduled = 0;

  for (const c of classes) {
    const feas = classFeasibility.find((f) => f.classId === c.id);
    if (!feas) continue;
    if (!feas.roomCapacityOk || !feas.trainerSlateOk || !feas.prereqReachable) {
      unscheduled += feas.sessionsNeeded;
      continue;
    }
    const sn = feas.sessionsNeeded;
    if (sn === 0) continue;

    const slateIds = trainersByClass.get(c.id) ?? [];
    const eligibleTrainers = slateIds
      .map((tid) => trainerState.get(tid))
      .filter((s): s is TrainerState => !!s);
    const eligibleRooms = [...roomState.values()].filter(
      (r) =>
        r.seatCapacity >= c.expected_learners_per_session &&
        tagSetContainsAll(r.equipmentTags, c.required_equipment_tags),
    );

    // Prereq earliest = max of "latest-ending session" across prereq classes.
    const myPrereqs = prereqsByClass.get(c.id) ?? [];
    let prereqMax: Date | null = null;
    for (const pid of myPrereqs) {
      const e = lastSessionEndByClass.get(pid);
      if (e && (!prereqMax || e > prereqMax)) prereqMax = e;
    }

    for (let i = 0; i < sn; i++) {
      const earliest =
        prereqMax && prereqMax > windowStart ? new Date(prereqMax) : new Date(windowStart);

      let placed = false;
      for (let tries = 0; tries < 1000 && !placed; tries++) {
        const room = pickBestFitRoom(eligibleRooms, c.expected_learners_per_session);
        if (!room) break;
        const trainer = pickLeastLoadedTrainer(eligibleTrainers, earliest, c.hours_per_session);
        if (!trainer) break;

        // The candidate start = max(earliest, room.nextFree, trainer.nextFree)
        let candidate = new Date(
          Math.max(earliest.getTime(), room.nextFree.getTime(), trainer.nextFree.getTime()),
        );
        // Snap to a working day open for the room, respecting room's start hour
        const snapped = snapToWorkingDay(
          candidate,
          room.daysOfWeek,
          targetEnd,
          room.startHourLocal,
        );
        if (!snapped) break;
        candidate = snapped;

        // Lunch interaction. If the candidate start falls inside the lunch
        // window, push to lunch end and re-loop. If it spans lunch, the
        // session's wall-clock occupancy = hours + lunch_length (the class
        // pauses for lunch but the resource is still committed).
        let candHr = candidate.getUTCHours() + candidate.getUTCMinutes() / 60;
        let lunchInfo = applyLunch(candHr, c.hours_per_session, lunch);
        if (lunchInfo.pushedTo !== null) {
          setHourOfDay(candidate, lunchInfo.pushedTo);
          candHr = lunchInfo.pushedTo;
          lunchInfo = applyLunch(candHr, c.hours_per_session, lunch);
        }
        const wallClockHours = lunchInfo.wallClockHours;

        // Cross-impl busy check: if the candidate window overlaps any
        // cross-impl busy interval for this trainer, push past the
        // interval and retry. Treat overlapping cross-impl commitments
        // as immovable walls — the SQL generator does the same via
        // pg_temp.tmp_busy_trainer.
        {
          const end = new Date(candidate.getTime() + wallClockHours * 3600 * 1000);
          let pushed = false;
          for (const busy of trainer.crossImplBusy) {
            if (busy.end <= candidate) continue; // busy ends before we start — fine
            if (busy.start >= end) break; // sorted; no more relevant overlaps
            // Overlaps. Push past it.
            trainer.nextFree = new Date(busy.end);
            pushed = true;
            break;
          }
          if (pushed) continue;
        }

        // Trainer weekly cap check (instruction hours only — lunch isn't
        // counted against the trainer's billable week).
        const wk = weekKey(candidate);
        const used = trainer.weeklyUsed.get(wk) ?? 0;
        if (used + c.hours_per_session > trainer.hoursPerWeek + 1e-6) {
          // Push trainer's nextFree to next Monday at room start so we try a fresh week
          const nextMonday = new Date(candidate);
          const dow = nextMonday.getUTCDay();
          const advance = dow === 0 ? 1 : 8 - dow;
          nextMonday.setUTCDate(nextMonday.getUTCDate() + advance);
          setHourOfDay(nextMonday, room.startHourLocal);
          trainer.nextFree = nextMonday;
          continue;
        }

        // Room daily-hours cap check. Day spans [startHour, startHour + hours_per_day],
        // plus lunch length if lunch falls inside that span. Wall-clock duration
        // (instruction + lunch when spanning) must fit inside that envelope.
        const dayEndHr =
          room.startHourLocal +
          room.hoursPerDay +
          (lunch &&
          lunch.startHr >= room.startHourLocal &&
          lunch.startHr < room.startHourLocal + room.hoursPerDay
            ? lunch.endHr - lunch.startHr
            : 0);
        if (candHr + wallClockHours > dayEndHr + 1e-6) {
          // Push room to next day at its start hour
          const nextDay = new Date(candidate);
          nextDay.setUTCDate(nextDay.getUTCDate() + 1);
          setHourOfDay(nextDay, room.startHourLocal);
          room.nextFree = nextDay;
          continue;
        }

        // Commit. nextFree advances by wall-clock so the next session in
        // the same room/trainer doesn't start before this one truly ends.
        const end = new Date(candidate.getTime() + wallClockHours * 3600 * 1000);
        if (end > targetEnd) break;

        room.nextFree = end;
        room.hoursAssigned += c.hours_per_session;
        trainer.nextFree = end;
        trainer.hoursAssigned += c.hours_per_session;
        trainer.weeklyUsed.set(wk, used + c.hours_per_session);

        lastSessionEndByClass.set(c.id, end);
        roomsByClass.get(c.id)?.add(room.id);
        trainersByClassUsed.get(c.id)?.add(trainer.id);
        sessionsScheduledByClass.set(c.id, (sessionsScheduledByClass.get(c.id) ?? 0) + 1);
        if (!latestEnd || end > latestEnd) latestEnd = end;
        placed = true;
      }
      if (!placed) unscheduled++;
    }
  }

  // Per-resource utilization
  const trainerUtil: ResourceUtilization[] = [];
  for (const [, t] of trainerState) {
    const available = t.hoursPerWeek * windowWeeks(impl.window_start_date, impl.window_end_date);
    const pct = available > 0 ? (t.hoursAssigned / available) * 100 : 0;
    trainerUtil.push({
      id: t.id,
      name: t.name,
      hoursAssigned: t.hoursAssigned,
      hoursAvailable: available,
      utilizationPct: pct,
    });
  }
  trainerUtil.sort((a, b) => b.utilizationPct - a.utilizationPct);

  const roomUtil: ResourceUtilization[] = [];
  for (const [, r] of roomState) {
    const wd = workingDaysInWindow(impl.window_start_date, impl.window_end_date, [...r.daysOfWeek]);
    const available = r.hoursPerDay * wd;
    const pct = available > 0 ? (r.hoursAssigned / available) * 100 : 0;
    roomUtil.push({
      id: r.id,
      name: r.name,
      hoursAssigned: r.hoursAssigned,
      hoursAvailable: available,
      utilizationPct: pct,
    });
  }
  roomUtil.sort((a, b) => b.utilizationPct - a.utilizationPct);

  // Days over target (Phase A target = window_end; Phase D will tighten to go_live - buffer)
  let daysOverTarget = 0;
  if (latestEnd) {
    if (latestEnd > targetEnd) {
      daysOverTarget = Math.ceil((latestEnd.getTime() - targetEnd.getTime()) / MS_PER_DAY);
    }
  } else if (unscheduled > 0) {
    daysOverTarget = -1; // signal that nothing got placed
  }

  return {
    estimatedCompletionDate: latestEnd ? fmtDate(latestEnd) : null,
    targetCompletionDate: fmtDate(targetEnd),
    unscheduledSessions: unscheduled,
    daysOverTarget,
    trainerUtilization: trainerUtil,
    roomUtilization: roomUtil,
    roomsByClass,
    trainersByClassUsed,
    sessionsScheduledByClass,
    simRan: true,
  };
}

function emptySim(rooms: ImplRoom[], trainers: ImplTrainer[]): SimResult {
  return {
    estimatedCompletionDate: null,
    targetCompletionDate: null,
    unscheduledSessions: 0,
    daysOverTarget: 0,
    roomsByClass: new Map(),
    trainersByClassUsed: new Map(),
    sessionsScheduledByClass: new Map(),
    simRan: false,
    trainerUtilization: trainers.map((t) => ({
      id: t.id,
      name: t.name,
      hoursAssigned: 0,
      hoursAvailable: 0,
      utilizationPct: 0,
    })),
    roomUtilization: rooms.map((r) => ({
      id: r.id,
      name: r.name,
      hoursAssigned: 0,
      hoursAvailable: 0,
      utilizationPct: 0,
    })),
  };
}

// ── Recommendations ─────────────────────────────────────────────────────────

function buildRecommendations(args: {
  classes: ImplClass[];
  classFeas: ClassFeasibility[];
  rooms: ImplRoom[];
  trainers: ImplTrainer[];
  totalTrainerHoursNeeded: number;
  totalTrainerHoursAvailable: number;
  totalRoomHoursAvailable: number;
  trainerUtilizationPct: number | null;
  roomUtilizationPct: number | null;
  windowWeeks: number;
  sim: SimResult;
}): Recommendation[] {
  const recs: Recommendation[] = [];

  // 1) Per-class blockers (specific actions)
  for (const cf of args.classFeas) {
    if (!cf.trainerSlateOk) {
      recs.push({ kind: "assign_trainer", classId: cf.classId, className: cf.className });
    }
  }

  // Add-room (by capacity) recs — collect classes that share a minSeats requirement
  const minSeatsByClass = new Map<number, string[]>();
  for (const cf of args.classFeas) {
    if (!cf.roomCapacityOk) {
      const cls = args.classes.find((c) => c.id === cf.classId);
      if (!cls) continue;
      const seats = cls.expected_learners_per_session;
      const list = minSeatsByClass.get(seats) ?? [];
      list.push(cls.name);
      minSeatsByClass.set(seats, list);
    }
  }
  for (const [seats, names] of minSeatsByClass) {
    recs.push({ kind: "add_capacity_room", minSeats: seats, classNames: names });
  }

  // 2) Aggregate trainer-hours gap
  const trainerDeficit = args.totalTrainerHoursNeeded - args.totalTrainerHoursAvailable;
  if (trainerDeficit > 0 && args.windowWeeks > 0) {
    const deficitPerWeek = trainerDeficit / args.windowWeeks;
    recs.push({ kind: "add_trainer_hours_per_week", hours: Math.ceil(deficitPerWeek) });

    // Trainer count rec: assume avg per-week capacity of current trainers, or 30 if none
    const avgHpw =
      args.trainers.length > 0
        ? args.trainers.reduce((a, t) => a + t.availability_hours_per_week, 0) /
          args.trainers.length
        : 30;
    const safeHpw = avgHpw > 0 ? avgHpw : 30;
    const count = Math.ceil(deficitPerWeek / safeHpw);
    if (count > 0) {
      recs.push({ kind: "add_trainers", count, hoursPerWeek: Math.round(safeHpw) });
    }

    // Window-extension rec: extra weeks of current capacity to cover deficit
    const currentWeekHours = args.totalTrainerHoursAvailable / args.windowWeeks;
    if (currentWeekHours > 0) {
      const extraWeeks = Math.ceil(trainerDeficit / currentWeekHours);
      recs.push({ kind: "extend_window_weeks", weeks: extraWeeks });
    }
  }

  // 3) Room-hours gap
  const roomDeficit = args.totalTrainerHoursNeeded - args.totalRoomHoursAvailable;
  if (roomDeficit > 0 && args.rooms.length > 0) {
    // Avg room hours per week
    const avgRoomHpw =
      args.totalRoomHoursAvailable / Math.max(1, args.windowWeeks * args.rooms.length);
    const safeRoomHpw = avgRoomHpw > 0 ? avgRoomHpw : 40;
    const totalRoomHpw = args.totalRoomHoursAvailable / Math.max(1, args.windowWeeks);
    if (totalRoomHpw > 0) {
      const deficitPerWeek = roomDeficit / args.windowWeeks;
      const count = Math.ceil(deficitPerWeek / safeRoomHpw);
      if (count > 0) recs.push({ kind: "add_rooms", count });
    }
  }

  // 4) Per-session-reduction rec — ONLY when at least one class is blocked
  // because no room has enough seats. Splitting a class into smaller groups
  // adds sessions, so it's counter-productive for an aggregate-hours
  // deficit (it makes the trainer/room hour problem strictly worse). It's
  // only the right lever when the seats are the constraint and the planner
  // would rather break up a 24-person class into two 12s to fit the
  // existing breakout rooms.
  const maxRoomSeats = args.rooms.reduce((m, r) => Math.max(m, r.seat_capacity), 0);
  for (const cf of args.classFeas) {
    if (cf.roomCapacityOk) continue;
    const cls = args.classes.find((c) => c.id === cf.classId);
    if (!cls) continue;
    // Seat-only blocker check: there is no room that fits the current
    // per-session, but some room could fit a smaller group.
    const seatsBlocked = !args.rooms.some(
      (r) => r.seat_capacity >= cls.expected_learners_per_session,
    );
    if (!seatsBlocked) continue;
    if (maxRoomSeats <= 0 || maxRoomSeats >= cls.expected_learners_per_session) continue;
    const newPer = maxRoomSeats;
    const extra =
      Math.ceil(cls.total_people_to_train / newPer) -
      Math.ceil(cls.total_people_to_train / cls.expected_learners_per_session);
    if (extra > 0) {
      recs.push({
        kind: "reduce_per_session_to",
        className: cls.name,
        learners: newPer,
        extraSessions: extra,
      });
    }
  }

  return recs;
}
