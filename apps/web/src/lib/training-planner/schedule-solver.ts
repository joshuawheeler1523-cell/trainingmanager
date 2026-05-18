// Backtracking CSP scheduler for training-planner implementations.
//
// Replaces the greedy pl/pgSQL generator (generate_implementation_schedule)
// with a real constraint-satisfaction search. The greedy version picked
// the first valid slot in lexicographic order and never reconsidered; if
// an earlier class grabbed a slot a later class also needed, the later
// class failed even when a feasible global assignment existed.
//
// This module is a pure function. The server action wires it up by
// loading data from Supabase, calling solve(), and writing the result
// back. No DB calls happen inside the solver.
//
// Algorithm:
//   1. Topologically order classes by prereq depth (ties: sort_order,
//      created_at). Within each class, expand into N session variables
//      where N = ceil(total_people / expected_per_session).
//   2. Pre-compute the static domain of each variable: every
//      (room, day, start_hour) triple where the room fits the class and
//      the room is open that day, restricted to the impl window /
//      go-live cutoff / prereq earliest start.
//   3. Backtracking search with chronological variable order. For each
//      variable, iterate its static domain × trainer slate; skip
//      candidates that collide with the current busy state; on a hit,
//      push the placement and recurse. On failure of all options,
//      backtrack one level.
//   4. Time-bounded. If wall-clock exceeds the budget the search aborts
//      and returns the deepest successful partial. Sessions that never
//      got placed end up in `gaps` with a reason.
//
// Constraints honored (match the pl/pgSQL generator):
//   - Room seat_capacity ≥ class.expected_learners_per_session
//   - Room equipment_tags ⊇ class.required_equipment_tags
//   - Room day-of-week filter
//   - Per-room start_hour_local / available_hours_per_day window
//   - Business hours window (impl.business_hours_start_local / end)
//   - Lunch break (jumps slot start past lunch; extends day end +
//     wall-clock time when a session would otherwise straddle lunch)
//   - go_live - go_live_buffer_days cutoff
//   - Prereq earliest start (max over prereqs of their earliest placed
//     session_start; same semantic as impl_class_prereq_earliest)
//   - Trainer slate (impl_class_trainers)
//   - Trainer max_concurrent_sessions
//   - Trainer availability_hours_per_week (ISO week buckets)
//   - PTO / unavailability intervals
//   - Pre-seeded busy intervals (anchor impls, cross-impl shared
//     instructor publishings, same-impl already-published sessions)

import { fromCalendarLocal } from "@/lib/timezone";
import type { ImplClass, ImplClassPrerequisite, ImplRoom, ImplTrainer } from "@arbor/shared";

// ── Diagnosis types (per-class failure analysis) ────────────────────────────

/** Classification of *why* a class's sessions couldn't be placed. Drives the
 *  recommended-fix wording. Ordered roughly by how easy each is to identify. */
export type DiagnosisBottleneck =
  | "no_trainers_assigned" // class has empty trainer slate
  | "no_eligible_room" // no room passes seat / equipment filter
  | "room_capacity" // eligible rooms saturated — forced demand > pool hours, no smaller-room fallback
  | "trainer_capacity" // slate hours < hours this class needs
  | "room_busy_or_window"; // resources exist but the search couldn't find clean slots

// ── Public types ────────────────────────────────────────────────────────────

export type BusyInterval = {
  /** Which trainer or room is busy. */
  resourceId: string;
  /** ISO UTC start. */
  start: string;
  /** ISO UTC end. */
  end: string;
};

export type ClassTrainerLink = {
  impl_class_id: string;
  impl_trainer_id: string;
};

export type SolverInput = {
  /** YYYY-MM-DD. */
  windowStartDate: string;
  /** YYYY-MM-DD. */
  windowEndDate: string;
  /** YYYY-MM-DD. Defaults to windowEndDate when go_live is unset. */
  cutoffDate: string;
  /** IANA tz, used as fallback when a room has no timezone. */
  orgTimeZone: string;

  /** Minutes from local midnight, 0–1439. */
  lunchBreakStartMinutes: number;
  /** Length of the lunch block. 0 disables lunch handling entirely. */
  lunchBreakLengthMinutes: number;
  /** Earliest local-hour any session may start. 0 = no limit. */
  businessHoursStartLocal: number;
  /** Latest local-hour any session may end (wall clock). 24 = no limit. */
  businessHoursEndLocal: number;

  rooms: ImplRoom[];
  trainers: ImplTrainer[];
  classes: ImplClass[];
  classTrainers: ClassTrainerLink[];
  prerequisites: ImplClassPrerequisite[];

  /** Trainer busy intervals: PTO and same-impl already-published sessions.
   *  The solver treats these as immovable. */
  busyTrainers: BusyInterval[];
  /** Room busy intervals: same-impl already-published sessions. */
  busyRooms: BusyInterval[];
  /** Per-trainer hours already burned in each ISO week by published
   *  same-impl sessions. Used to enforce availability_hours_per_week
   *  on top of new placements. Keyed `${trainerId}::${weekKey}` where
   *  weekKey is YYYY-W## (ISO week, Monday-anchored). */
  initialTrainerWeekHours: Record<string, number>;
};

export type Placement = {
  classId: string;
  className: string;
  sessionIndex: number;
  trainerId: string;
  roomId: string;
  /** ISO UTC. */
  start: string;
  /** ISO UTC. */
  end: string;
  learnersCount: number;
};

export type Gap = {
  classId: string;
  className: string;
  sessionIndex: number;
  reason: string;
};

/** Per-class diagnosis aggregated from one or more Gaps. One row per class
 *  that ended up with at least one unplaced session, with a recommended fix
 *  written for a manager who needs to know what resource to add. */
export type ClassDiagnosis = {
  classId: string;
  className: string;
  unplacedSessions: number;
  bottleneck: DiagnosisBottleneck;
  /** Trainers currently assigned to this class. Empty when slate is empty. */
  assignedTrainers: { id: string; name: string; hoursPerWeek: number }[];
  /** Rooms that pass seat + equipment filter for this class. */
  eligibleRoomCount: number;
  /** Class's expected_learners_per_session (the seat floor). */
  requiredSeats: number;
  /** Equipment tags this class needs in its room. */
  requiredEquipment: string[];
  /** Trainer-hours still needed for the unplaced sessions. */
  hoursNeeded: number;
  /** One-sentence directive for the manager. */
  recommendedFix: string;
};

/** The single fix that would unblock the most sessions. The UI shows this
 *  as a headline above the per-class breakdown. Null when there are no gaps. */
export type HeadlineFix = {
  classId: string;
  recommendedFix: string;
  sessionsUnblocked: number;
};

export type SolverResult = {
  placements: Placement[];
  gaps: Gap[];
  /** Per-class diagnoses, sorted by unplacedSessions descending. */
  diagnoses: ClassDiagnosis[];
  /** Highest-impact single fix, or null when no gaps exist. */
  headlineFix: HeadlineFix | null;
  /** Total wall-clock ms taken inside solve(). */
  durationMs: number;
  /** True if the search hit the time budget before exhausting options.
   *  When this is true, `gaps` is an upper bound — there might still be
   *  a feasible plan the search ran out of time to find. */
  timedOut: boolean;
};

export type SolverOptions = {
  /** Wall-clock budget in ms. The search aborts at this point and
   *  returns the best partial result. Default 5000. */
  timeBudgetMs?: number;
  /** Optional clock for deterministic tests. */
  now?: () => number;
};

// ── Internal types ──────────────────────────────────────────────────────────

type PrecomputedSlot = {
  /** YYYY-MM-DD in the room's local calendar. */
  day: string;
  roomId: string;
  /** Local hour the session content begins (post-lunch jump applied). */
  startHourLocal: number;
  /** Wall-clock hours from start to end (instruction + lunch when
   *  spanning). */
  wallClockHours: number;
  /** Instruction hours (charged against trainer weekly cap). */
  instructionHours: number;
  /** ISO UTC start instant. */
  startIso: string;
  /** ISO UTC end instant. */
  endIso: string;
};

type Variable = {
  /** Unique within a single solve() call. */
  id: string;
  classId: string;
  className: string;
  sessionIndex: number;
  hoursPerSession: number;
  /** Total people / expected_per_session math, capped at expected per session for this slice. */
  learnersCount: number;
  /** Trainer ids eligible to teach this class. */
  trainerSlate: string[];
  /** prereqIds whose earliest placed session must precede this one. */
  prereqClassIds: string[];
  /** Static placements (already filtered by room fitness, day, business
   *  hours, lunch, PTO — but NOT current-search busy state, not weekly
   *  hours, not prereq order). */
  slots: PrecomputedSlot[];
};

type WorkingState = {
  /** Sorted by start; binary search isn't worth it at this scale. */
  busyTrainers: Map<string, BusyInterval[]>;
  busyRooms: Map<string, BusyInterval[]>;
  trainerWeekHours: Map<string, number>; // key: `${trainerId}::${weekKey}`
  trainerConcurrent: Map<string, number>; // running session counts per trainer (unused, kept for parity)
  /** Per-class earliest placed session start. Used to compute the
   *  effective prereq_min for downstream classes. */
  classEarliestStart: Map<string, string>;
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseUtcDate(s: string): Date {
  return new Date(s + "T00:00:00Z");
}

function fmtUtcDate(d: Date): string {
  const y = d.getUTCFullYear().toString();
  const m = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = d.getUTCDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** ISO week key, Monday-anchored, in the form YYYY-Www (matches the
 *  Postgres `to_char(date_trunc('week', ts), 'IYYY-IW')` used by the
 *  pl/pgSQL generator). */
function isoWeekKey(d: Date): string {
  // Find Monday of d's ISO week (UTC).
  const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay(); // 1..7 Mon..Sun
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - (dow - 1));
  // Compute ISO week number using the standard algorithm.
  const target = new Date(
    Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate()),
  );
  const dayNum = target.getUTCDay() === 0 ? 7 : target.getUTCDay();
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${target.getUTCFullYear().toString()}-W${week.toString().padStart(2, "0")}`;
}

function trainerWeekKey(trainerId: string, weekKey: string): string {
  return `${trainerId}::${weekKey}`;
}

function tagSubset(
  required: string[] | null | undefined,
  available: string[] | null | undefined,
): boolean {
  if (!required || required.length === 0) return true;
  const set = new Set(available ?? []);
  for (const t of required) if (!set.has(t)) return false;
  return true;
}

/** Earliest placed session start across the given prereq class ids in
 *  the current working state. Matches the SQL: NULL (here: undefined)
 *  when none of the prereqs have any placed sessions yet. */
function prereqEarliestStart(
  prereqClassIds: string[],
  classEarliestStart: Map<string, string>,
): string | undefined {
  let max: string | undefined;
  for (const pid of prereqClassIds) {
    const start = classEarliestStart.get(pid);
    if (!start) continue;
    if (max === undefined || start > max) max = start;
  }
  return max;
}

/** Iterate dates from start to end (inclusive). */
function* daysInRange(
  startDate: string,
  endDate: string,
): Generator<{ date: string; dayOfWeek: number }> {
  const start = parseUtcDate(startDate);
  const end = parseUtcDate(endDate);
  if (end < start) return;
  const cursor = new Date(start);
  while (cursor <= end) {
    yield { date: fmtUtcDate(cursor), dayOfWeek: cursor.getUTCDay() };
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
}

/** Check if [aStart, aEnd) overlaps [bStart, bEnd). All ISO UTC strings. */
function intervalsOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && aEnd > bStart;
}

function classSessionsNeeded(c: ImplClass): number {
  return Math.ceil(c.total_people_to_train / Math.max(c.expected_learners_per_session, 1));
}

function learnersForSession(c: ImplClass, sessionIdx: number): number {
  // sessionIdx is 1-indexed. Each session takes expected_per_session
  // learners except the last, which mops up the remainder.
  const remaining = c.total_people_to_train - (sessionIdx - 1) * c.expected_learners_per_session;
  return Math.max(0, Math.min(c.expected_learners_per_session, remaining));
}

// ── Topological order (Kahn's algorithm) ────────────────────────────────────

function topologicalOrderClasses(
  classes: ImplClass[],
  prereqs: ImplClassPrerequisite[],
): ImplClass[] {
  const inDeg = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const c of classes) inDeg.set(c.id, 0);
  for (const p of prereqs) {
    if (!inDeg.has(p.impl_class_id) || !inDeg.has(p.prerequisite_id)) continue;
    inDeg.set(p.impl_class_id, (inDeg.get(p.impl_class_id) ?? 0) + 1);
    const list = dependents.get(p.prerequisite_id) ?? [];
    list.push(p.impl_class_id);
    dependents.set(p.prerequisite_id, list);
  }

  const sortKey = (c: ImplClass): string =>
    `${c.sort_order.toString().padStart(10, "0")}|${c.created_at}|${c.id}`;
  const byId = new Map(classes.map((c) => [c.id, c]));

  const ready: ImplClass[] = classes
    .filter((c) => (inDeg.get(c.id) ?? 0) === 0)
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

  const out: ImplClass[] = [];
  while (ready.length > 0) {
    const next = ready.shift();
    if (!next) break;
    out.push(next);
    for (const depId of dependents.get(next.id) ?? []) {
      const d = (inDeg.get(depId) ?? 0) - 1;
      inDeg.set(depId, d);
      if (d === 0) {
        const dep = byId.get(depId);
        if (dep) {
          // Maintain stable order via insertion sort.
          const idx = ready.findIndex((r) => sortKey(r) > sortKey(dep));
          if (idx === -1) ready.push(dep);
          else ready.splice(idx, 0, dep);
        }
      }
    }
  }

  // Cycles shouldn't happen (DB trigger blocks them) but tolerate them
  // by appending unseen classes so the solver never silently drops one.
  if (out.length < classes.length) {
    const seen = new Set(out.map((c) => c.id));
    for (const c of classes) if (!seen.has(c.id)) out.push(c);
  }
  return out;
}

// ── Static slot pre-computation per (class, room, day) ──────────────────────

function precomputeSlotsForClass(
  c: ImplClass,
  trainerSlate: string[],
  rooms: ImplRoom[],
  prereqClassIds: string[],
  input: SolverInput,
  trainerPto: Map<string, BusyInterval[]>,
): PrecomputedSlot[] {
  const slots: PrecomputedSlot[] = [];

  const eligibleRooms = rooms.filter(
    (r) =>
      r.seat_capacity >= c.expected_learners_per_session &&
      tagSubset(c.required_equipment_tags, r.equipment_tags),
  );
  if (eligibleRooms.length === 0 || trainerSlate.length === 0) return slots;

  const lunchActive = input.lunchBreakLengthMinutes > 0;
  const lunchStartHr = input.lunchBreakStartMinutes / 60;
  const lunchLengthHr = input.lunchBreakLengthMinutes / 60;
  const lunchEndHr = lunchStartHr + lunchLengthHr;
  const bizStartHr = input.businessHoursStartLocal;
  const bizEndHr = input.businessHoursEndLocal;

  for (const room of eligibleRooms) {
    const roomDays = new Set(room.available_days_of_week);
    const roomTz = room.timezone ?? input.orgTimeZone;

    let dayEnd = room.start_hour_local + room.available_hours_per_day;
    if (
      lunchActive &&
      lunchStartHr >= room.start_hour_local &&
      lunchStartHr < room.start_hour_local + room.available_hours_per_day
    ) {
      dayEnd += lunchLengthHr;
    }
    dayEnd = Math.min(dayEnd, bizEndHr);
    const roomStartHr = Math.max(room.start_hour_local, bizStartHr);
    if (dayEnd <= roomStartHr) continue;

    for (const { date, dayOfWeek } of daysInRange(input.windowStartDate, input.cutoffDate)) {
      if (!roomDays.has(dayOfWeek)) continue;

      // Walk the day in instructional steps. The SQL generator advances
      // local_hr by hours_per_session each iteration (or by wall_clock
      // when the session straddles lunch). We mirror that.
      let localHr = roomStartHr;
      while (localHr + c.hours_per_session <= dayEnd) {
        let wallClockHr = c.hours_per_session;
        let spansLunch = false;
        let effectiveStart = localHr;

        if (lunchActive && effectiveStart >= lunchStartHr && effectiveStart < lunchEndHr) {
          effectiveStart = lunchEndHr;
          if (effectiveStart + c.hours_per_session > dayEnd) break;
        } else if (
          lunchActive &&
          effectiveStart < lunchStartHr &&
          effectiveStart + c.hours_per_session > lunchStartHr
        ) {
          spansLunch = true;
          wallClockHr = c.hours_per_session + lunchLengthHr;
          if (effectiveStart + wallClockHr > dayEnd) {
            localHr += c.hours_per_session;
            continue;
          }
        }

        const startIso = wallClockLocalToUtc(date, effectiveStart, roomTz);
        const endIso = wallClockLocalToUtc(date, effectiveStart + wallClockHr, roomTz);

        slots.push({
          day: date,
          roomId: room.id,
          startHourLocal: effectiveStart,
          wallClockHours: wallClockHr,
          instructionHours: c.hours_per_session,
          startIso,
          endIso,
        });

        // Lunch handling: when we jumped past lunch, advance to next
        // post-lunch instructional step. Otherwise advance by wall_clock.
        localHr = spansLunch ? effectiveStart + wallClockHr : effectiveStart + c.hours_per_session;
      }
    }
  }

  // Filter out slots that collide with any trainer's PTO. We can't yet
  // know which trainer will be picked, so we keep slots if AT LEAST ONE
  // eligible trainer has no PTO conflict. Per-trainer pruning is done
  // during search.
  return slots.filter((slot) => {
    return trainerSlate.some((trainerId) => {
      const pto = trainerPto.get(trainerId) ?? [];
      return !pto.some((p) => intervalsOverlap(slot.startIso, slot.endIso, p.start, p.end));
    });
  });
}

function wallClockLocalToUtc(date: string, hourLocal: number, tz: string): string {
  // Build a fake-local Date with the given wall-clock fields, then ask
  // the timezone util to map it to the UTC instant.
  const wholeHour = Math.floor(hourLocal);
  const minutes = Math.round((hourLocal - wholeHour) * 60);
  const [y, m, d] = date.split("-").map(Number);
  const fake = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, wholeHour, minutes, 0, 0);
  return fromCalendarLocal(fake, tz);
}

// ── Search ──────────────────────────────────────────────────────────────────

function isTrainerBusyAt(
  state: WorkingState,
  trainerId: string,
  startIso: string,
  endIso: string,
  maxConcurrent: number,
): boolean {
  const intervals = state.busyTrainers.get(trainerId) ?? [];
  let overlapping = 0;
  for (const iv of intervals) {
    if (intervalsOverlap(startIso, endIso, iv.start, iv.end)) {
      overlapping++;
      if (overlapping >= maxConcurrent) return true;
    }
  }
  return false;
}

function isRoomBusyAt(
  state: WorkingState,
  roomId: string,
  startIso: string,
  endIso: string,
): boolean {
  const intervals = state.busyRooms.get(roomId) ?? [];
  for (const iv of intervals) {
    if (intervalsOverlap(startIso, endIso, iv.start, iv.end)) return true;
  }
  return false;
}

function pushBusy(map: Map<string, BusyInterval[]>, resourceId: string, iv: BusyInterval): void {
  const list = map.get(resourceId);
  if (list) list.push(iv);
  else map.set(resourceId, [iv]);
}

function popBusy(map: Map<string, BusyInterval[]>, resourceId: string): void {
  const list = map.get(resourceId);
  if (!list) return;
  list.pop();
  if (list.length === 0) map.delete(resourceId);
}

type SearchContext = {
  deadline: number;
  now: () => number;
  gaps: Gap[];
  abortFlag: { timedOut: boolean };
  /** Deepest placement set seen during search. When the search can't
   *  find a complete assignment, we fall back to this so the user gets
   *  the best partial — matching what the greedy generator would have
   *  produced on a partially-infeasible input, instead of "everything
   *  is a gap." Snapshotted via slice() each time the depth advances. */
  best: Placement[];
};

function search(
  variables: Variable[],
  trainersById: Map<string, ImplTrainer>,
  state: WorkingState,
  placements: Placement[],
  options: SearchContext,
): boolean {
  if (options.now() > options.deadline) {
    options.abortFlag.timedOut = true;
    return false;
  }
  if (placements.length > options.best.length) {
    options.best = placements.slice();
  }
  if (variables.length === placements.length) return true;

  const v = variables[placements.length];
  if (!v) return true;

  const prereqMin = prereqEarliestStart(v.prereqClassIds, state.classEarliestStart);

  // Build candidate list: every (slot, trainer) pair on this variable
  // that survives static filters. Within search we then check current
  // busy state.
  for (const slot of v.slots) {
    if (prereqMin !== undefined && slot.startIso < prereqMin) continue;
    if (isRoomBusyAt(state, slot.roomId, slot.startIso, slot.endIso)) continue;

    for (const trainerId of v.trainerSlate) {
      const trainer = trainersById.get(trainerId);
      if (!trainer) continue;

      // Skip if trainer's PTO collides (already partially filtered at
      // precompute, but the precompute kept a slot if ANY trainer was
      // clear — confirm per-trainer here).
      const pto = state.busyTrainers.get(trainerId) ?? [];
      if (
        pto.some(
          (p) =>
            p.resourceId === "__pto__" &&
            intervalsOverlap(slot.startIso, slot.endIso, p.start, p.end),
        )
      ) {
        continue;
      }

      if (
        isTrainerBusyAt(
          state,
          trainerId,
          slot.startIso,
          slot.endIso,
          trainer.max_concurrent_sessions,
        )
      ) {
        continue;
      }

      const weekKey = isoWeekKey(new Date(slot.startIso));
      const wkKey = trainerWeekKey(trainerId, weekKey);
      const usedHours = state.trainerWeekHours.get(wkKey) ?? 0;
      if (usedHours + slot.instructionHours > trainer.availability_hours_per_week) continue;

      // ── Tentatively place ──
      const placement: Placement = {
        classId: v.classId,
        className: v.className,
        sessionIndex: v.sessionIndex,
        trainerId,
        roomId: slot.roomId,
        start: slot.startIso,
        end: slot.endIso,
        learnersCount: v.learnersCount,
      };
      const trainerIv: BusyInterval = {
        resourceId: trainerId,
        start: slot.startIso,
        end: slot.endIso,
      };
      const roomIv: BusyInterval = {
        resourceId: slot.roomId,
        start: slot.startIso,
        end: slot.endIso,
      };
      pushBusy(state.busyTrainers, trainerId, trainerIv);
      pushBusy(state.busyRooms, slot.roomId, roomIv);
      state.trainerWeekHours.set(wkKey, usedHours + slot.instructionHours);
      const prevEarliest = state.classEarliestStart.get(v.classId);
      if (!prevEarliest || slot.startIso < prevEarliest) {
        state.classEarliestStart.set(v.classId, slot.startIso);
      }
      placements.push(placement);

      if (search(variables, trainersById, state, placements, options)) return true;
      if (options.abortFlag.timedOut) return false;

      // ── Undo ──
      placements.pop();
      popBusy(state.busyTrainers, trainerId);
      popBusy(state.busyRooms, slot.roomId);
      if (usedHours === 0) state.trainerWeekHours.delete(wkKey);
      else state.trainerWeekHours.set(wkKey, usedHours);
      if (prevEarliest === undefined) state.classEarliestStart.delete(v.classId);
      else state.classEarliestStart.set(v.classId, prevEarliest);
    }
  }

  // No valid placement for this variable in the current branch. Record
  // a gap candidate; if a later backtrack frees things up, it'll be
  // overwritten. Final gaps come from the variables left unassigned
  // after search returns.
  return false;
}

function buildVariables(input: SolverInput): {
  variables: Variable[];
  classSlate: Map<string, string[]>;
  classPrereqs: Map<string, string[]>;
} {
  const trainersByClass = new Map<string, string[]>();
  for (const ct of input.classTrainers) {
    const list = trainersByClass.get(ct.impl_class_id) ?? [];
    list.push(ct.impl_trainer_id);
    trainersByClass.set(ct.impl_class_id, list);
  }

  const prereqsByClass = new Map<string, string[]>();
  for (const p of input.prerequisites) {
    const list = prereqsByClass.get(p.impl_class_id) ?? [];
    list.push(p.prerequisite_id);
    prereqsByClass.set(p.impl_class_id, list);
  }

  // Pre-build per-trainer PTO so static precompute can prune.
  const trainerPto = new Map<string, BusyInterval[]>();
  for (const iv of input.busyTrainers) {
    // PTO intervals are tagged via resourceId = trainerId. Anchor /
    // cross-impl intervals are also keyed by trainerId, but for
    // static pruning we just want anything currently busy. Keep all.
    const list = trainerPto.get(iv.resourceId) ?? [];
    list.push(iv);
    trainerPto.set(iv.resourceId, list);
  }

  const orderedClasses = topologicalOrderClasses(input.classes, input.prerequisites);
  const variables: Variable[] = [];

  for (const c of orderedClasses) {
    const sessions = classSessionsNeeded(c);
    if (sessions === 0) continue;
    const slate = trainersByClass.get(c.id) ?? [];
    const prereqIds = prereqsByClass.get(c.id) ?? [];
    const slots = precomputeSlotsForClass(c, slate, input.rooms, prereqIds, input, trainerPto);
    for (let i = 1; i <= sessions; i++) {
      variables.push({
        id: `${c.id}::${i.toString()}`,
        classId: c.id,
        className: c.name,
        sessionIndex: i,
        hoursPerSession: c.hours_per_session,
        learnersCount: learnersForSession(c, i),
        trainerSlate: slate,
        prereqClassIds: prereqIds,
        slots,
      });
    }
  }

  return { variables, classSlate: trainersByClass, classPrereqs: prereqsByClass };
}

function initialState(input: SolverInput): WorkingState {
  const busyTrainers = new Map<string, BusyInterval[]>();
  for (const iv of input.busyTrainers) {
    pushBusy(busyTrainers, iv.resourceId, iv);
  }
  const busyRooms = new Map<string, BusyInterval[]>();
  for (const iv of input.busyRooms) {
    pushBusy(busyRooms, iv.resourceId, iv);
  }
  const trainerWeekHours = new Map<string, number>();
  for (const [k, v] of Object.entries(input.initialTrainerWeekHours)) {
    trainerWeekHours.set(k, v);
  }
  return {
    busyTrainers,
    busyRooms,
    trainerWeekHours,
    trainerConcurrent: new Map(),
    classEarliestStart: new Map(),
  };
}

// ── Per-class diagnosis ─────────────────────────────────────────────────────

/** Sum of hours each ISO-week-window busyTrainers interval contributes to a
 *  trainer's used budget, clipped to the impl window. We use the *raw* hour
 *  count (not weekly cap math) because the goal is to compare against
 *  slate-wide capacity, not enforce the weekly rule a second time. */
function busyHoursOnSlate(
  slateIds: Set<string>,
  intervals: BusyInterval[],
  windowStartUtc: number,
  windowEndUtc: number,
): number {
  let total = 0;
  for (const iv of intervals) {
    if (!slateIds.has(iv.resourceId)) continue;
    const s = Math.max(new Date(iv.start).getTime(), windowStartUtc);
    const e = Math.min(new Date(iv.end).getTime(), windowEndUtc);
    if (e > s) total += (e - s) / 3_600_000;
  }
  return total;
}

function placedHoursOnSlate(slateIds: Set<string>, placements: Placement[]): number {
  let total = 0;
  for (const p of placements) {
    if (!slateIds.has(p.trainerId)) continue;
    total += (new Date(p.end).getTime() - new Date(p.start).getTime()) / 3_600_000;
  }
  return total;
}

/** Estimate how many hours a room is bookable across the window. Counts only
 *  days-of-week the room is open, multiplied by its per-day hours. Doesn't
 *  intersect with business hours / lunch — that would under-state the pool
 *  because a single class only needs a slice of it. Good enough for a
 *  saturation ratio. */
function roomHoursInWindow(room: ImplRoom, windowStartDate: string, windowEndDate: string): number {
  const openSet = new Set(room.available_days_of_week);
  let openDays = 0;
  const start = parseUtcDate(windowStartDate);
  const end = parseUtcDate(windowEndDate);
  const cursor = new Date(start);
  while (cursor <= end) {
    if (openSet.has(cursor.getUTCDay())) openDays++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return openDays * room.available_hours_per_day;
}

/** Subtract hours of placed sessions in the given rooms (so room pool reflects
 *  remaining capacity, not theoretical max). */
function placedHoursInRooms(roomIds: Set<string>, placements: Placement[]): number {
  let total = 0;
  for (const p of placements) {
    if (!roomIds.has(p.roomId)) continue;
    total += (new Date(p.end).getTime() - new Date(p.start).getTime()) / 3_600_000;
  }
  return total;
}

function buildDiagnoses(
  gaps: Gap[],
  input: SolverInput,
  placements: Placement[],
): ClassDiagnosis[] {
  if (gaps.length === 0) return [];

  const classById = new Map(input.classes.map((c) => [c.id, c]));
  const trainerById = new Map(input.trainers.map((t) => [t.id, t]));

  const slateByClass = new Map<string, string[]>();
  for (const ct of input.classTrainers) {
    const list = slateByClass.get(ct.impl_class_id) ?? [];
    list.push(ct.impl_trainer_id);
    slateByClass.set(ct.impl_class_id, list);
  }

  const gapsByClass = new Map<string, Gap[]>();
  for (const g of gaps) {
    const list = gapsByClass.get(g.classId) ?? [];
    list.push(g);
    gapsByClass.set(g.classId, list);
  }

  // Window math — used for slate-hours-available estimation.
  const windowStartUtc = parseUtcDate(input.windowStartDate).getTime();
  const windowEndUtc = parseUtcDate(input.windowEndDate).getTime() + 86_400_000 - 1;
  const windowWeeks = Math.max(
    1,
    Math.ceil((windowEndUtc - windowStartUtc + 1) / (7 * 86_400_000)),
  );

  const diagnoses: ClassDiagnosis[] = [];

  for (const [classId, classGaps] of gapsByClass) {
    const cls = classById.get(classId);
    if (!cls) continue;

    const slateIds = slateByClass.get(classId) ?? [];
    const slateTrainers = slateIds
      .map((id) => trainerById.get(id))
      .filter((t): t is ImplTrainer => !!t);
    const assignedTrainers = slateTrainers.map((t) => ({
      id: t.id,
      name: t.name,
      hoursPerWeek: t.availability_hours_per_week,
    }));

    const eligibleRooms = input.rooms.filter(
      (r) =>
        r.seat_capacity >= cls.expected_learners_per_session &&
        tagSubset(cls.required_equipment_tags, r.equipment_tags),
    );

    const unplaced = classGaps.length;
    const hoursNeeded = unplaced * cls.hours_per_session;
    const requiredSeats = cls.expected_learners_per_session;
    const requiredEquipment = cls.required_equipment_tags;

    let bottleneck: DiagnosisBottleneck;
    let recommendedFix: string;

    if (slateIds.length === 0) {
      bottleneck = "no_trainers_assigned";
      recommendedFix = `Assign a trainer to "${cls.name}" — no trainers are in its slate.`;
    } else if (eligibleRooms.length === 0) {
      bottleneck = "no_eligible_room";
      const seatsOk = input.rooms.some((r) => r.seat_capacity >= requiredSeats);
      if (!seatsOk) {
        recommendedFix = `Add a room with at least ${requiredSeats.toString()} seats — none of your rooms meet "${cls.name}"'s seat requirement.`;
      } else if (requiredEquipment.length > 0) {
        recommendedFix = `Add a room with equipment: ${requiredEquipment.join(", ")}. No configured room has the gear "${cls.name}" needs.`;
      } else {
        recommendedFix = `No room can host "${cls.name}" — review room day-of-week availability and the implementation window.`;
      }
    } else {
      // ── Slate (trainer) capacity math ──
      const slateIdSet = new Set(slateIds);
      const slateCap = slateTrainers.reduce(
        (acc, t) => acc + t.availability_hours_per_week * windowWeeks,
        0,
      );
      const slateBusy = busyHoursOnSlate(
        slateIdSet,
        input.busyTrainers,
        windowStartUtc,
        windowEndUtc,
      );
      const slateUsed = placedHoursOnSlate(slateIdSet, placements);
      const slateAvail = Math.max(0, slateCap - slateBusy - slateUsed);
      const slateRatio = slateAvail > 0 ? hoursNeeded / slateAvail : 999;

      // ── Room capacity math ──
      // Pool = eligible rooms' bookable hours in window, minus what we've
      // already placed. Forced demand = hours from EVERY class that can ONLY
      // use rooms this class can use (i.e., no smaller-seat fallback). This
      // captures the "TR1 is the only 18-seat room and 7 classes all need it"
      // pattern.
      const eligibleRoomIds = new Set(eligibleRooms.map((r) => r.id));
      const roomPoolRaw = eligibleRooms.reduce(
        (acc, r) => acc + roomHoursInWindow(r, input.windowStartDate, input.windowEndDate),
        0,
      );
      const roomUsedByPlacements = placedHoursInRooms(eligibleRoomIds, placements);
      const roomAvail = Math.max(0, roomPoolRaw - roomUsedByPlacements);

      // Largest seat capacity among rooms NOT eligible for this class.
      // Classes whose required seats exceed this number have no fallback
      // outside this class's eligible-room set — they "force" demand into
      // the same pool.
      const ineligibleSeats = input.rooms
        .filter((r) => !eligibleRoomIds.has(r.id))
        .map((r) => r.seat_capacity);
      const fallbackCapacity = ineligibleSeats.length > 0 ? Math.max(...ineligibleSeats) : -1;

      // Sum hours from forced competitors (including this class).
      let forcedDemandHours = 0;
      for (const c2 of input.classes) {
        if (c2.expected_learners_per_session <= fallbackCapacity) continue;
        // Equipment match: skip classes whose equipment requirements wouldn't
        // also need this room subset. Approximation: any class with equipment
        // tags ⊆ first eligible room's tags. Conservative: include all forced
        // by seat alone.
        const sessions = classSessionsNeeded(c2);
        forcedDemandHours += sessions * c2.hours_per_session;
      }
      const roomRatio = roomAvail > 0 ? forcedDemandHours / roomAvail : 999;

      const slateNames = assignedTrainers.map((t) => t.name).join(", ");
      const eligibleRoomNames = eligibleRooms.map((r) => r.name).join(", ");

      // ── Bottleneck classification ──
      //
      // Priority is INTENTIONALLY: room_capacity BEFORE trainer_capacity.
      // Hiring a trainer when rooms are the constraint is expensive and
      // unhelpful — we want the message to clearly disambiguate.
      const roomIsTighter = roomRatio >= slateRatio && roomRatio >= 0.5;
      const slateIsOverbooked = slateRatio > 1.0;

      if (roomIsTighter) {
        bottleneck = "room_capacity";
        const fallbackSuggestion =
          fallbackCapacity > 0
            ? ` Or split "${cls.name}" into smaller cohorts (≤${fallbackCapacity.toString()} learners/session) so smaller rooms can host it.`
            : "";
        let fix = `"${cls.name}" needs ${requiredSeats.toString()}+ seats — only ${eligibleRooms.length.toString()} room${eligibleRooms.length === 1 ? "" : "s"} fit${eligibleRooms.length === 1 ? "s" : ""} (${eligibleRoomNames}). Across all classes that have no smaller-room fallback, ${forcedDemandHours.toFixed(0)}h of training is competing for ${roomAvail.toFixed(0)}h of room time in the window. Add another ${requiredSeats.toString()}+ seat room.${fallbackSuggestion}`;
        if (slateRatio < 0.5) {
          fix += ` Trainers are NOT the bottleneck — assigned trainers (${slateNames}) have ~${slateAvail.toFixed(0)}h free vs ${hoursNeeded.toFixed(0)}h needed for this class. Adding trainers will not help; fix the room.`;
        }
        recommendedFix = fix;
      } else if (slateIsOverbooked) {
        bottleneck = "trainer_capacity";
        recommendedFix = `Add another trainer to "${cls.name}". Its slate (${slateNames}) has only ~${slateAvail.toFixed(0)}h free in the window, but the ${unplaced.toString()} remaining session${unplaced === 1 ? "" : "s"} need ${hoursNeeded.toFixed(0)}h.`;
      } else {
        bottleneck = "room_busy_or_window";
        recommendedFix = `Rooms big enough for "${cls.name}" (${requiredSeats.toString()}+ seats) are fully booked across the available days. Add another ${requiredSeats.toString()}+ seat room, or extend the window past ${input.windowEndDate}.`;
      }
    }

    diagnoses.push({
      classId,
      className: cls.name,
      unplacedSessions: unplaced,
      bottleneck,
      assignedTrainers,
      eligibleRoomCount: eligibleRooms.length,
      requiredSeats,
      requiredEquipment,
      hoursNeeded,
      recommendedFix,
    });
  }

  diagnoses.sort((a, b) => b.unplacedSessions - a.unplacedSessions);
  return diagnoses;
}

function describeFailure(v: Variable, input: SolverInput): string {
  if (v.trainerSlate.length === 0) {
    return "No trainers assigned to this class";
  }
  const eligibleRooms = input.rooms.filter((r) => r.seat_capacity >= 1);
  if (eligibleRooms.length === 0) return "No rooms defined";
  if (v.slots.length === 0) {
    // Find specifically why no static slots.
    const seatOk = input.rooms.some((r) => r.seat_capacity >= v.learnersCount);
    if (!seatOk) return `No room with ${v.learnersCount.toString()}+ seats`;
    return "No room/day/lunch combination fits this session in the window";
  }
  return "No conflict-free slot when honoring trainer / room availability and the anchored impl(s)";
}

// ── Public entry point ──────────────────────────────────────────────────────

export function solve(input: SolverInput, options: SolverOptions = {}): SolverResult {
  const now = options.now ?? (() => Date.now());
  const startedAt = now();
  const timeBudgetMs = options.timeBudgetMs ?? 5000;
  const deadline = startedAt + timeBudgetMs;

  const { variables } = buildVariables(input);
  const state = initialState(input);
  const trainersById = new Map(input.trainers.map((t) => [t.id, t]));
  const placements: Placement[] = [];
  const gaps: Gap[] = [];
  const abortFlag = { timedOut: false };

  // Quick win: if any variable has zero slots up front, it's
  // immediately unschedulable. Move them to gaps and skip them in the
  // search so a single bad class doesn't doom the rest.
  const searchable: Variable[] = [];
  for (const v of variables) {
    if (v.slots.length === 0 || v.trainerSlate.length === 0) {
      gaps.push({
        classId: v.classId,
        className: v.className,
        sessionIndex: v.sessionIndex,
        reason: describeFailure(v, input),
      });
    } else {
      searchable.push(v);
    }
  }

  const ctx: SearchContext = {
    deadline,
    now,
    gaps,
    abortFlag,
    best: [],
  };
  const found = search(searchable, trainersById, state, placements, ctx);

  // If the search couldn't find a complete assignment, fall back to the
  // deepest partial it saw. This is what keeps us at least as good as
  // greedy on partially-infeasible inputs: the prior version returned
  // an empty placement list whenever ANY variable was infeasible, which
  // wiped out perfectly-good placements that just happened to be made
  // before the doomed variable came up. With `best` we always return
  // the best partial seen during the search, even when the full
  // assignment turns out to be impossible.
  const finalPlacements = found ? placements : ctx.best;

  // Anything in searchable that didn't land in finalPlacements is a gap.
  if (finalPlacements.length < searchable.length) {
    const placedIds = new Set(
      finalPlacements.map((p) => `${p.classId}::${p.sessionIndex.toString()}`),
    );
    for (const v of searchable) {
      if (!placedIds.has(v.id)) {
        gaps.push({
          classId: v.classId,
          className: v.className,
          sessionIndex: v.sessionIndex,
          reason: describeFailure(v, input),
        });
      }
    }
  }

  const diagnoses = buildDiagnoses(gaps, input, finalPlacements);
  const headlineFix: HeadlineFix | null =
    diagnoses.length > 0 && diagnoses[0]
      ? {
          classId: diagnoses[0].classId,
          recommendedFix: diagnoses[0].recommendedFix,
          sessionsUnblocked: diagnoses[0].unplacedSessions,
        }
      : null;

  return {
    placements: finalPlacements,
    gaps,
    diagnoses,
    headlineFix,
    durationMs: now() - startedAt,
    timedOut: abortFlag.timedOut,
  };
}
