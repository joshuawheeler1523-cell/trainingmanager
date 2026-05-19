// Pure validator for hand-placed sessions in the training planner's manual
// mode. Mirrors the hard constraints enforced by the CSP solver so the user
// sees the same "this slot is OK" verdict whether they let the solver place
// the session or drag it themselves.
//
// Used in two places:
//   1. Client side, called on dragOver/drop in grid-schedule-view.tsx to give
//      instant red/green feedback and refuse impossible drops.
//   2. Server side, called inside the placeManualSession action as the
//      authoritative check before INSERTing impl_sessions.
//
// All inputs are already-loaded plain rows — no DB calls happen here. The
// server action loads the context, calls the validator, then writes.

import { fromCalendarLocal } from "@/lib/timezone";
import type { Implementation, ImplClass, ImplRoom, ImplSession, ImplTrainer } from "@arbor/shared";

export type ClassTrainerLink = {
  impl_class_id: string;
  impl_trainer_id: string;
};

export type TrainerUnavailability = {
  impl_trainer_id: string;
  starts_at: string;
  ends_at: string;
};

export type ValidationContext = {
  impl: Implementation;
  classes: ImplClass[];
  rooms: ImplRoom[];
  trainers: ImplTrainer[];
  classTrainers: ClassTrainerLink[];
  /** Non-cancelled sessions in THIS implementation. */
  sessions: ImplSession[];
  pto: TrainerUnavailability[];
  /** IANA tz used as fallback when a room has no timezone. */
  orgTimeZone: string;
};

export type PlacementCandidate = {
  classId: string;
  roomId: string;
  /** YYYY-MM-DD in the room's local calendar. */
  startLocalDate: string;
  /** Wall-clock start hour in the room's local calendar (0..24, fractional). */
  startLocalHour: number;
};

export type ValidationOk = {
  ok: true;
  trainerId: string;
  startIso: string;
  endIso: string;
  /** Wall-clock minutes including any lunch straddle extension. */
  durationMin: number;
  learnersCount: number;
};

export type ValidationFail = {
  ok: false;
  reasons: string[];
};

export type ValidationResult = ValidationOk | ValidationFail;

function dayOfWeek(localDate: string): number {
  // localDate is YYYY-MM-DD; interpret as UTC for the dow computation. The
  // day-of-week numbering matches Date.getUTCDay() (0=Sun..6=Sat) which is
  // what impl_rooms.available_days_of_week stores.
  return new Date(localDate + "T00:00:00Z").getUTCDay();
}

function intervalsOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && aEnd > bStart;
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

function isoWeekKey(d: Date): string {
  const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  target.setUTCDate(target.getUTCDate() + 4 - dow);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${target.getUTCFullYear().toString()}-W${week.toString().padStart(2, "0")}`;
}

function wallClockLocalToUtc(date: string, hourLocal: number, tz: string): string {
  const wholeHour = Math.floor(hourLocal);
  const minutes = Math.round((hourLocal - wholeHour) * 60);
  const [y, m, d] = date.split("-").map(Number);
  const fake = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, wholeHour, minutes, 0, 0);
  return fromCalendarLocal(fake, tz);
}

function learnersForClass(c: ImplClass, alreadyPlaced: number): number {
  // Each session takes expected_per_session learners except the last, which
  // mops up the remainder. We don't know the session_index ahead of time for
  // manual placements, but we can derive it from how many already exist.
  const remaining = c.total_people_to_train - alreadyPlaced * c.expected_learners_per_session;
  return Math.max(0, Math.min(c.expected_learners_per_session, remaining));
}

export function validateManualPlacement(
  candidate: PlacementCandidate,
  ctx: ValidationContext,
): ValidationResult {
  const reasons: string[] = [];

  const cls = ctx.classes.find((c) => c.id === candidate.classId);
  if (!cls) return { ok: false, reasons: ["Class not found in this implementation."] };

  const room = ctx.rooms.find((r) => r.id === candidate.roomId);
  if (!room) return { ok: false, reasons: ["Room not found in this implementation."] };

  // ── Impl window ─────────────────────────────────────────────────────────
  if (!ctx.impl.window_start_date || !ctx.impl.window_end_date) {
    return { ok: false, reasons: ["Implementation window dates aren't set."] };
  }
  if (candidate.startLocalDate < ctx.impl.window_start_date) {
    reasons.push(`Before the window start (${ctx.impl.window_start_date}).`);
  }
  if (candidate.startLocalDate > ctx.impl.window_end_date) {
    reasons.push(`After the window end (${ctx.impl.window_end_date}).`);
  }

  // ── Room seat + equipment eligibility ───────────────────────────────────
  if (room.seat_capacity < cls.expected_learners_per_session) {
    reasons.push(
      `${room.name} only seats ${room.seat_capacity.toString()} — class needs ${cls.expected_learners_per_session.toString()}.`,
    );
  }
  if (!tagSubset(cls.required_equipment_tags, room.equipment_tags)) {
    const have = new Set(room.equipment_tags);
    const missing = cls.required_equipment_tags.filter((t) => !have.has(t));
    reasons.push(`${room.name} is missing required equipment: ${missing.join(", ")}.`);
  }

  // ── Room day-of-week + per-day window ───────────────────────────────────
  const dow = dayOfWeek(candidate.startLocalDate);
  if (!room.available_days_of_week.includes(dow)) {
    reasons.push(`${room.name} is closed that day of the week.`);
  }

  const lunchActive = ctx.impl.lunch_break_length_minutes > 0;
  const lunchStartHr = ctx.impl.lunch_break_start_minutes / 60;
  const lunchLengthHr = ctx.impl.lunch_break_length_minutes / 60;
  const lunchEndHr = lunchStartHr + lunchLengthHr;
  const bizStartHr = ctx.impl.business_hours_start_local;
  const bizEndHr = ctx.impl.business_hours_end_local;

  // Effective day end: room's window, extended if lunch falls inside it,
  // then clamped by business hours.
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

  if (candidate.startLocalHour < roomStartHr) {
    reasons.push(
      `Earlier than ${room.name}'s start time (${roomStartHr.toFixed(1).replace(/\.0$/, "")}:00).`,
    );
  }

  // Lunch straddle: extend the wall-clock duration by lunchLengthHr.
  let wallClockHours = cls.hours_per_session;
  if (
    lunchActive &&
    candidate.startLocalHour >= lunchStartHr &&
    candidate.startLocalHour < lunchEndHr
  ) {
    reasons.push(
      `Starts inside the lunch break (${formatHour(lunchStartHr)}–${formatHour(lunchEndHr)}).`,
    );
  } else if (
    lunchActive &&
    candidate.startLocalHour < lunchStartHr &&
    candidate.startLocalHour + cls.hours_per_session > lunchStartHr
  ) {
    wallClockHours = cls.hours_per_session + lunchLengthHr;
  }

  if (candidate.startLocalHour + wallClockHours > dayEnd) {
    reasons.push(`Doesn't fit before ${room.name} closes at ${formatHour(dayEnd)}.`);
  }

  // ── Cutoff (go-live − buffer) ──────────────────────────────────────────
  if (ctx.impl.go_live_date) {
    const goLive = new Date(ctx.impl.go_live_date + "T00:00:00Z");
    goLive.setUTCDate(goLive.getUTCDate() - ctx.impl.go_live_buffer_days);
    const cutoff = goLive.toISOString().slice(0, 10);
    if (candidate.startLocalDate > cutoff) {
      reasons.push(
        `Past the go-live cutoff (${cutoff}, ${ctx.impl.go_live_buffer_days.toString()}d buffer).`,
      );
    }
  }

  if (reasons.length > 0) return { ok: false, reasons };

  // ── Materialize the candidate's start/end as UTC instants ─────────────
  const roomTz = room.timezone ?? ctx.orgTimeZone;
  const startIso = wallClockLocalToUtc(candidate.startLocalDate, candidate.startLocalHour, roomTz);
  const endIso = wallClockLocalToUtc(
    candidate.startLocalDate,
    candidate.startLocalHour + wallClockHours,
    roomTz,
  );

  // ── Room not double-booked in this impl ────────────────────────────────
  const roomConflict = ctx.sessions.find(
    (s) =>
      s.impl_room_id === room.id &&
      s.status !== "cancelled" &&
      intervalsOverlap(startIso, endIso, s.scheduled_start, s.scheduled_end),
  );
  if (roomConflict) {
    return { ok: false, reasons: [`${room.name} is already booked at that time.`] };
  }

  // ── Trainer auto-pick from class slate ─────────────────────────────────
  const slateIds = ctx.classTrainers
    .filter((ct) => ct.impl_class_id === cls.id)
    .map((ct) => ct.impl_trainer_id);
  if (slateIds.length === 0) {
    return { ok: false, reasons: [`No trainers are assigned to "${cls.name}".`] };
  }

  const instructionHours = cls.hours_per_session;
  const weekKey = isoWeekKey(new Date(startIso));

  let pickedTrainerId: string | null = null;
  const trainerReasons: string[] = [];
  for (const trainerId of slateIds) {
    const trainer = ctx.trainers.find((t) => t.id === trainerId);
    if (!trainer) continue;

    // PTO collision?
    const pto = ctx.pto.find(
      (u) =>
        u.impl_trainer_id === trainerId &&
        intervalsOverlap(startIso, endIso, u.starts_at, u.ends_at),
    );
    if (pto) {
      trainerReasons.push(`${trainer.name}: on PTO.`);
      continue;
    }

    // Existing in-impl session collision?
    const otherSessions = ctx.sessions.filter(
      (s) =>
        s.impl_trainer_id === trainerId &&
        s.status !== "cancelled" &&
        intervalsOverlap(startIso, endIso, s.scheduled_start, s.scheduled_end),
    );
    if (otherSessions.length >= trainer.max_concurrent_sessions) {
      trainerReasons.push(`${trainer.name}: already teaching another class.`);
      continue;
    }

    // Weekly hours budget?
    const sameWeekHours = ctx.sessions
      .filter(
        (s) =>
          s.impl_trainer_id === trainerId &&
          s.status !== "cancelled" &&
          isoWeekKey(new Date(s.scheduled_start)) === weekKey,
      )
      .reduce(
        (acc, s) =>
          acc +
          (new Date(s.scheduled_end).getTime() - new Date(s.scheduled_start).getTime()) / 3_600_000,
        0,
      );
    if (sameWeekHours + instructionHours > trainer.availability_hours_per_week) {
      trainerReasons.push(
        `${trainer.name}: would exceed ${trainer.availability_hours_per_week.toString()}h this week.`,
      );
      continue;
    }

    pickedTrainerId = trainerId;
    break;
  }

  if (!pickedTrainerId) {
    return {
      ok: false,
      reasons: ["No assigned trainer is free at that time.", ...trainerReasons],
    };
  }

  // Learner count for this newly-placed session: count already-placed
  // non-cancelled sessions for this class to determine which "slot" of the
  // total this fills.
  const alreadyPlacedForClass = ctx.sessions.filter(
    (s) => s.impl_class_id === cls.id && s.status !== "cancelled",
  ).length;
  const learnersCount = learnersForClass(cls, alreadyPlacedForClass);
  if (learnersCount === 0) {
    return {
      ok: false,
      reasons: [`"${cls.name}" has no remaining learners — every session is already placed.`],
    };
  }

  return {
    ok: true,
    trainerId: pickedTrainerId,
    startIso,
    endIso,
    durationMin: Math.round(wallClockHours * 60),
    learnersCount,
  };
}

function formatHour(h: number): string {
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  const h12 = whole % 12 === 0 ? 12 : whole % 12;
  const ampm = whole < 12 ? "AM" : "PM";
  return `${h12.toString()}:${mins.toString().padStart(2, "0")} ${ampm}`;
}
