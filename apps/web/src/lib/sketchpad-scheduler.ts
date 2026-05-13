// Sketchpad auto-scheduler — pure, deterministic placement of N identical
// sessions into a sketchpad's day window. Reuses ideas from the production
// generator (least-loaded trainer pick, best-fit room, pre-seeded busy
// state) but operates on sketchpad's free-text trainer / room data rather
// than the impl_trainers / impl_classes graph.
//
// The intent: a planner says "I need 5 × EMR Provider, 2h each" and we
// drop them across the schedule, avoiding trainer and room conflicts and
// distributing across days when possible. The result lists what was
// placed plus a per-row reason for anything we couldn't fit, so the UI
// can surface a coherent gap message.

export type SchedulerRequest = {
  className: string;
  trainerName: string | null; // null → auto-pick from known trainers
  durationMinutes: number;
  count: number;
  learnerCount: number | null;
  preferredRoomId: string | null; // null → best-fit
  preferredStartMinutes: number | null; // minutes-of-day; null → start of window
  distribution: "one-per-day" | "fill-earliest";
};

export type SchedulerInput = {
  schedule: {
    startDate: string;
    dayCount: number;
    hoursStart: number;
    hoursEnd: number;
    slotMinutes: number;
  };
  rooms: Array<{ id: string; name: string; capacity: number | null }>;
  existing: Array<{
    id: string;
    starts_at: string;
    ends_at: string;
    room_id: string | null;
    trainer_name: string;
  }>;
  request: SchedulerRequest;
};

export type ScheduledPlacement = {
  trainerName: string;
  className: string;
  startsAt: string;
  endsAt: string;
  roomId: string | null;
  learnerCount: number | null;
};

export type SchedulerResult = {
  placed: ScheduledPlacement[];
  unplaced: Array<{ index: number; reason: string }>;
  gaps: string[];
};

type Interval = [number, number]; // [startMs, endMs)

function addInterval(map: Map<string, Interval[]>, key: string, start: number, end: number) {
  let list = map.get(key);
  if (!list) {
    list = [];
    map.set(key, list);
  }
  list.push([start, end]);
}

function intervalConflict(intervals: Interval[] | undefined, start: number, end: number): boolean {
  if (!intervals) return false;
  for (const [a, b] of intervals) {
    if (a < end && start < b) return true;
  }
  return false;
}

function dayStart(startDate: string, dayIndex: number): Date {
  const [y, m, d] = startDate.split("-").map(Number);
  const dt = new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() + dayIndex);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function rankRooms(
  rooms: Array<{ id: string; name: string; capacity: number | null }>,
  preferredRoomId: string | null,
  learnerCount: number | null,
): Array<{ id: string; capacity: number | null }> {
  if (preferredRoomId) {
    const pref = rooms.find((r) => r.id === preferredRoomId);
    return pref ? [pref] : [];
  }
  // Best-fit: smallest capacity that satisfies the learner count, then
  // smaller-first among the rest. Null capacity goes last (unknown size).
  const ranked = rooms.slice().sort((a, b) => {
    const aCap = a.capacity;
    const bCap = b.capacity;
    if (aCap == null && bCap == null) return a.name.localeCompare(b.name);
    if (aCap == null) return 1;
    if (bCap == null) return -1;
    if (learnerCount != null) {
      const aFits = aCap >= learnerCount;
      const bFits = bCap >= learnerCount;
      if (aFits && !bFits) return -1;
      if (!aFits && bFits) return 1;
    }
    return aCap - bCap;
  });
  return ranked;
}

export function placeSessions(input: SchedulerInput): SchedulerResult {
  const { schedule, rooms, existing, request } = input;

  if (request.count <= 0) {
    return { placed: [], unplaced: [], gaps: [] };
  }
  if (request.durationMinutes <= 0) {
    return {
      placed: [],
      unplaced: Array.from({ length: request.count }, (_, i) => ({
        index: i,
        reason: "Duration must be positive",
      })),
      gaps: [],
    };
  }
  if (schedule.dayCount <= 0 || schedule.hoursEnd <= schedule.hoursStart) {
    return {
      placed: [],
      unplaced: Array.from({ length: request.count }, (_, i) => ({
        index: i,
        reason: "Schedule window is empty",
      })),
      gaps: [],
    };
  }

  const candidateRooms = rankRooms(rooms, request.preferredRoomId, request.learnerCount);

  const busyTrainer = new Map<string, Interval[]>();
  const busyRoom = new Map<string, Interval[]>();
  const trainerLoad = new Map<string, number>();
  const knownTrainers = new Map<string, string>();

  for (const s of existing) {
    const start = new Date(s.starts_at).getTime();
    const end = new Date(s.ends_at).getTime();
    const tk = s.trainer_name.trim().toLowerCase();
    if (tk) {
      addInterval(busyTrainer, tk, start, end);
      trainerLoad.set(tk, (trainerLoad.get(tk) ?? 0) + (end - start) / 60_000);
      if (!knownTrainers.has(tk)) knownTrainers.set(tk, s.trainer_name.trim());
    }
    if (s.room_id) addInterval(busyRoom, s.room_id, start, end);
  }

  const slotMinutes = Math.max(5, schedule.slotMinutes);
  const dayStartMin = schedule.hoursStart * 60;
  const dayEndMin = schedule.hoursEnd * 60;
  const earliestStartMin =
    request.preferredStartMinutes != null
      ? Math.max(dayStartMin, request.preferredStartMinutes)
      : dayStartMin;

  const placed: ScheduledPlacement[] = [];
  const unplaced: Array<{ index: number; reason: string }> = [];

  for (let i = 0; i < request.count; i++) {
    // Resolve trainer for this session.
    let trainerKey: string;
    let trainerName: string;
    if (request.trainerName && request.trainerName.trim()) {
      trainerName = request.trainerName.trim();
      trainerKey = trainerName.toLowerCase();
      if (!knownTrainers.has(trainerKey)) knownTrainers.set(trainerKey, trainerName);
    } else if (knownTrainers.size === 0) {
      unplaced.push({
        index: i,
        reason: "No trainer specified and no known trainers in this schedule",
      });
      continue;
    } else {
      // Least-loaded known trainer. Ties broken by name for determinism.
      let bestKey: string | null = null;
      let bestLoad = Infinity;
      const sortedKeys = Array.from(knownTrainers.keys()).sort();
      for (const k of sortedKeys) {
        const load = trainerLoad.get(k) ?? 0;
        if (load < bestLoad) {
          bestLoad = load;
          bestKey = k;
        }
      }
      trainerKey = bestKey ?? "";
      trainerName = knownTrainers.get(trainerKey) ?? "";
    }

    // Day search order.
    let dayOrder: number[];
    if (request.distribution === "one-per-day") {
      const startDay = i % schedule.dayCount;
      dayOrder = [];
      for (let d = 0; d < schedule.dayCount; d++) {
        dayOrder.push((startDay + d) % schedule.dayCount);
      }
    } else {
      dayOrder = Array.from({ length: schedule.dayCount }, (_, k) => k);
    }

    let chosen: ScheduledPlacement | null = null;
    for (const dayIdx of dayOrder) {
      const day = dayStart(schedule.startDate, dayIdx);
      for (
        let mins = earliestStartMin;
        mins + request.durationMinutes <= dayEndMin;
        mins += slotMinutes
      ) {
        const slotStart = new Date(day);
        slotStart.setMinutes(slotStart.getMinutes() + mins);
        const slotEnd = new Date(slotStart);
        slotEnd.setMinutes(slotEnd.getMinutes() + request.durationMinutes);
        const startMs = slotStart.getTime();
        const endMs = slotEnd.getTime();

        if (intervalConflict(busyTrainer.get(trainerKey), startMs, endMs)) continue;

        // Pick the first candidate room that's free at this slot.
        let pickedRoomId: string | null = null;
        for (const r of candidateRooms) {
          if (!intervalConflict(busyRoom.get(r.id), startMs, endMs)) {
            pickedRoomId = r.id;
            break;
          }
        }
        if (candidateRooms.length > 0 && pickedRoomId == null) continue;

        chosen = {
          trainerName,
          className: request.className.trim(),
          startsAt: slotStart.toISOString(),
          endsAt: slotEnd.toISOString(),
          roomId: pickedRoomId,
          learnerCount: request.learnerCount,
        };
        break;
      }
      if (chosen) break;
    }

    if (chosen) {
      placed.push(chosen);
      const sMs = new Date(chosen.startsAt).getTime();
      const eMs = new Date(chosen.endsAt).getTime();
      addInterval(busyTrainer, trainerKey, sMs, eMs);
      if (chosen.roomId) addInterval(busyRoom, chosen.roomId, sMs, eMs);
      trainerLoad.set(trainerKey, (trainerLoad.get(trainerKey) ?? 0) + request.durationMinutes);
    } else {
      unplaced.push({ index: i, reason: "No conflict-free slot in the day window" });
    }
  }

  const gaps: string[] = [];
  if (unplaced.length > 0) {
    const totalMinutes = unplaced.length * request.durationMinutes;
    const dailyMinutes = (schedule.hoursEnd - schedule.hoursStart) * 60;
    const daysNeeded = dailyMinutes > 0 ? Math.ceil(totalMinutes / dailyMinutes) : 0;
    gaps.push(
      `${unplaced.length.toString()} of ${request.count.toString()} unplaced ` +
        `(${totalMinutes.toString()} min / ~${daysNeeded.toString()} more day${
          daysNeeded === 1 ? "" : "s"
        } of window needed)`,
    );
  }

  return { placed, unplaced, gaps };
}
