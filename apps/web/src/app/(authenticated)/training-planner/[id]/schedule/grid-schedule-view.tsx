"use client";

import { useMemo } from "react";
import type { ImplClass, ImplRoom, ImplSession, ImplTrainer, Implementation } from "@arbor/shared";
import { toCalendarLocal } from "@/lib/timezone";

type Props = {
  implementation: Implementation;
  sessions: ImplSession[];
  classes: ImplClass[];
  trainers: ImplTrainer[];
  rooms: ImplRoom[];
  orgTimeZone: string;
  onOpenSession: (sessionId: string) => void;
};

// Same palette as the calendar view so users see consistent class colors
// when switching modes.
const CLASS_PALETTE = [
  "#bfdbfe",
  "#c7d2fe",
  "#ddd6fe",
  "#e9d5ff",
  "#f5d0fe",
  "#fbcfe8",
  "#a5f3fc",
  "#99f6e4",
  "#bae6fd",
  "#fed7aa",
  "#d9f99d",
  "#e2e8f0",
] as const;

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function colorForClass(classId: string): string {
  return CLASS_PALETTE[hashString(classId) % CLASS_PALETTE.length] ?? "#bfdbfe";
}

// Time grid: 7:00 AM → 7:00 PM in 30-min increments. Matches the user's
// reference spreadsheet layout. 25 rows total (7:00 to 19:00 inclusive).
const SLOT_START_HOUR = 7;
const SLOT_END_HOUR = 19;
const SLOT_STEP_MIN = 30;
const SLOT_COUNT = ((SLOT_END_HOUR - SLOT_START_HOUR) * 60) / SLOT_STEP_MIN + 1;

type Slot = { hour: number; minute: number; label: string };

function buildSlots(): Slot[] {
  const out: Slot[] = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    const total = SLOT_START_HOUR * 60 + i * SLOT_STEP_MIN;
    const hour = Math.floor(total / 60);
    const minute = total % 60;
    const h12 = hour % 12 === 0 ? 12 : hour % 12;
    const ampm = hour < 12 ? "AM" : "PM";
    out.push({
      hour,
      minute,
      label: `${h12.toString()}:${minute.toString().padStart(2, "0")} ${ampm}`,
    });
  }
  return out;
}

type WeekDay = { date: string; dayLabel: string; dateLabel: string };

function buildWeekdays(startDate: string, endDate: string): WeekDay[] {
  const out: WeekDay[] = [];
  const start = new Date(startDate + "T00:00:00Z");
  const end = new Date(endDate + "T00:00:00Z");
  const cursor = new Date(start);
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  while (cursor <= end) {
    const dow = cursor.getUTCDay();
    if (dow >= 1 && dow <= 5) {
      const m = (cursor.getUTCMonth() + 1).toString();
      const d = cursor.getUTCDate().toString();
      out.push({
        date: cursor.toISOString().slice(0, 10),
        dayLabel: dayNames[dow] ?? "",
        dateLabel: `${m}/${d}`,
      });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

type Placed = {
  session: ImplSession;
  startSlotIdx: number; // index into slots[]
  spanSlots: number; // how many slots the session occupies
  isConflict: boolean;
};

function buildPlacementsForRoom(
  sessions: ImplSession[],
  roomId: string,
  weekdays: WeekDay[],
  orgTimeZone: string,
  slots: Slot[],
): Map<string, Placed[]> {
  // Key: date string (YYYY-MM-DD)
  const byDay = new Map<string, Placed[]>();
  for (const s of sessions) {
    if (s.impl_room_id !== roomId) continue;
    if (s.status === "cancelled") continue;
    const startLocal = toCalendarLocal(s.scheduled_start, orgTimeZone);
    const endLocal = toCalendarLocal(s.scheduled_end, orgTimeZone);
    const date =
      startLocal.getFullYear().toString().padStart(4, "0") +
      "-" +
      (startLocal.getMonth() + 1).toString().padStart(2, "0") +
      "-" +
      startLocal.getDate().toString().padStart(2, "0");
    if (!weekdays.some((w) => w.date === date)) continue;

    const startMins = startLocal.getHours() * 60 + startLocal.getMinutes();
    const endMins = endLocal.getHours() * 60 + endLocal.getMinutes();
    const startSlotIdx = Math.max(
      0,
      Math.round((startMins - SLOT_START_HOUR * 60) / SLOT_STEP_MIN),
    );
    const spanSlots = Math.max(1, Math.round((endMins - startMins) / SLOT_STEP_MIN));
    if (startSlotIdx >= slots.length) continue;
    const placed: Placed = {
      session: s,
      startSlotIdx,
      spanSlots,
      isConflict: s.conflict_status !== "none",
    };
    const arr = byDay.get(date) ?? [];
    arr.push(placed);
    byDay.set(date, arr);
  }
  return byDay;
}

export default function GridScheduleView({
  implementation,
  sessions,
  classes,
  trainers,
  rooms,
  orgTimeZone,
  onOpenSession,
}: Props) {
  const slots = useMemo(() => buildSlots(), []);
  const weekdays = useMemo(
    () =>
      buildWeekdays(implementation.window_start_date ?? "", implementation.window_end_date ?? ""),
    [implementation.window_start_date, implementation.window_end_date],
  );

  const classMap = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const trainerMap = useMemo(() => new Map(trainers.map((t) => [t.id, t])), [trainers]);

  if (weekdays.length === 0) {
    return (
      <div className="border-border bg-background text-muted-foreground rounded-xl border p-6 text-sm">
        Set window dates in Setup before viewing the grid.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {rooms.map((room) => (
        <RoomGrid
          key={room.id}
          room={room}
          sessions={sessions}
          weekdays={weekdays}
          slots={slots}
          classMap={classMap}
          trainerMap={trainerMap}
          orgTimeZone={orgTimeZone}
          onOpenSession={onOpenSession}
        />
      ))}
    </div>
  );
}

function RoomGrid({
  room,
  sessions,
  weekdays,
  slots,
  classMap,
  trainerMap,
  orgTimeZone,
  onOpenSession,
}: {
  room: ImplRoom;
  sessions: ImplSession[];
  weekdays: WeekDay[];
  slots: Slot[];
  classMap: Map<string, ImplClass>;
  trainerMap: Map<string, ImplTrainer>;
  orgTimeZone: string;
  onOpenSession: (sessionId: string) => void;
}) {
  const placements = useMemo(
    () => buildPlacementsForRoom(sessions, room.id, weekdays, orgTimeZone, slots),
    [sessions, room.id, weekdays, orgTimeZone, slots],
  );

  // Build a 2D occupancy map [slotIdx][dayIdx] -> Placed | "occupied" | null.
  // "occupied" means a session that started earlier covers this slot (so we
  // skip rendering a cell here — the originating cell uses rowspan).
  type CellState = { kind: "free" } | { kind: "start"; placed: Placed } | { kind: "occupied" };
  const grid: CellState[][] = Array.from({ length: slots.length }, () =>
    Array.from<unknown, CellState>({ length: weekdays.length }, () => ({ kind: "free" })),
  );
  for (let d = 0; d < weekdays.length; d++) {
    const wd = weekdays[d];
    if (!wd) continue;
    const dayPlacements = placements.get(wd.date) ?? [];
    for (const p of dayPlacements) {
      const startRow = grid[p.startSlotIdx];
      if (!startRow) continue;
      startRow[d] = { kind: "start", placed: p };
      for (let k = 1; k < p.spanSlots; k++) {
        const row = grid[p.startSlotIdx + k];
        if (!row) break;
        row[d] = { kind: "occupied" };
      }
    }
  }

  const totalSessions = Array.from(placements.values()).reduce((a, b) => a + b.length, 0);

  return (
    <div className="border-border bg-background overflow-hidden rounded-xl border">
      <div className="border-border flex items-baseline justify-between border-b px-4 py-3">
        <div>
          <h3 className="text-foreground font-serif text-base tracking-tight">{room.name}</h3>
          <p className="text-muted-foreground mt-0.5 text-[11px]">
            Capacity {room.seat_capacity.toString()} seats · {totalSessions.toString()} session
            {totalSessions === 1 ? "" : "s"} placed
          </p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th className="border-border bg-surface text-muted-foreground sticky left-0 z-10 border-b border-r px-2 py-1.5 text-left font-medium uppercase tracking-wide">
                Time
              </th>
              {weekdays.map((w) => (
                <th
                  key={w.date}
                  className="border-border text-muted-foreground border-b border-r px-2 py-1.5 text-center text-[10px] font-medium uppercase tracking-wide"
                  style={{ minWidth: 110 }}
                >
                  <div className="text-foreground font-semibold">{w.dayLabel}</div>
                  <div className="tabular-nums">{w.dateLabel}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slots.map((slot, slotIdx) => (
              <tr key={slot.label}>
                <th className="border-border bg-surface text-muted-foreground sticky left-0 z-10 border-b border-r px-2 py-1 text-right font-normal tabular-nums">
                  {slot.label}
                </th>
                {weekdays.map((w, d) => {
                  const cell = grid[slotIdx]?.[d];
                  if (!cell || cell.kind === "occupied") return null;
                  if (cell.kind === "start") {
                    return (
                      <SessionCell
                        key={w.date}
                        placed={cell.placed}
                        rowSpan={cell.placed.spanSlots}
                        classMap={classMap}
                        trainerMap={trainerMap}
                        onClick={() => {
                          onOpenSession(cell.placed.session.id);
                        }}
                      />
                    );
                  }
                  return (
                    <td
                      key={w.date}
                      className="border-border border-b border-r"
                      style={{ height: 22 }}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SessionCell({
  placed,
  rowSpan,
  classMap,
  trainerMap,
  onClick,
}: {
  placed: Placed;
  rowSpan: number;
  classMap: Map<string, ImplClass>;
  trainerMap: Map<string, ImplTrainer>;
  onClick: () => void;
}) {
  const cls = classMap.get(placed.session.impl_class_id);
  const trainer = placed.session.impl_trainer_id
    ? trainerMap.get(placed.session.impl_trainer_id)
    : null;
  const bg = colorForClass(placed.session.impl_class_id);
  const conflictBorder =
    placed.session.conflict_status === "full"
      ? "ring-2 ring-rose-500 ring-inset"
      : placed.session.conflict_status === "partial"
        ? "ring-2 ring-amber-500 ring-inset"
        : "";
  return (
    <td
      rowSpan={rowSpan}
      onClick={onClick}
      className={`border-border cursor-pointer border-b border-r p-1 align-top transition-opacity hover:opacity-80 ${conflictBorder}`}
      style={{ backgroundColor: bg }}
      title={[
        cls?.name ?? "—",
        trainer ? `Trainer: ${trainer.name}` : "No trainer",
        `${placed.session.learners_count.toString()} learners · ${placed.session.status}`,
        placed.session.conflict_reason ? `⚠ ${placed.session.conflict_reason}` : null,
      ]
        .filter((x): x is string => !!x)
        .join("\n")}
    >
      <div className="text-foreground line-clamp-2 text-[11px] font-medium leading-tight">
        {cls?.name ?? "—"}
      </div>
      {trainer && (
        <div className="text-foreground/70 mt-0.5 text-[10px] leading-tight">{trainer.name}</div>
      )}
    </td>
  );
}
