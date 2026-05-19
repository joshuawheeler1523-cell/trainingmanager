"use client";

import { useMemo, useState, type DragEvent } from "react";
import { MagnifyingGlassMinusIcon, MagnifyingGlassPlusIcon } from "@heroicons/react/20/solid";
import type { ImplClass, ImplRoom, ImplSession, ImplTrainer, Implementation } from "@arbor/shared";
import { toCalendarLocal, fromCalendarLocal } from "@/lib/timezone";

type Props = {
  implementation: Implementation;
  sessions: ImplSession[];
  classes: ImplClass[];
  trainers: ImplTrainer[];
  rooms: ImplRoom[];
  orgTimeZone: string;
  onOpenSession: (sessionId: string) => void;
  onMoveSession: (args: {
    sessionId: string;
    newRoomId: string;
    newStartIso: string;
    newEndIso: string;
  }) => void;
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

// Time grid: 7:00 AM → 7:00 PM in 30-min increments.
const SLOT_START_HOUR = 7;
const SLOT_END_HOUR = 19;
const SLOT_STEP_MIN = 30;
const SLOT_COUNT = ((SLOT_END_HOUR - SLOT_START_HOUR) * 60) / SLOT_STEP_MIN + 1;

// Zoom presets — control row height, font size, and minimum column width.
// "compact" gets all 5 rooms onto one screen; "spacious" matches the
// original first-cut sizing.
type Zoom = "compact" | "comfortable" | "spacious";
const ZOOM_PRESETS: Record<Zoom, { rowH: number; fontPx: number; colMin: number; pad: string }> = {
  compact: { rowH: 12, fontPx: 9, colMin: 60, pad: "px-1 py-0" },
  comfortable: { rowH: 16, fontPx: 10, colMin: 80, pad: "px-1.5 py-0.5" },
  spacious: { rowH: 22, fontPx: 11, colMin: 110, pad: "px-2 py-1" },
};

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
  startSlotIdx: number;
  spanSlots: number;
};

function buildPlacementsForRoom(
  sessions: ImplSession[],
  roomId: string,
  weekdays: WeekDay[],
  orgTimeZone: string,
  slots: Slot[],
): Map<string, Placed[]> {
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
    const placed: Placed = { session: s, startSlotIdx, spanSlots };
    const arr = byDay.get(date) ?? [];
    arr.push(placed);
    byDay.set(date, arr);
  }
  return byDay;
}

// Convert a drop target (roomId, date, slotIdx) back to ISO timestamps,
// preserving the moved session's duration.
function dropToIso(
  date: string,
  slotIdx: number,
  durationMin: number,
  orgTimeZone: string,
): { startIso: string; endIso: string } {
  const totalStartMin = SLOT_START_HOUR * 60 + slotIdx * SLOT_STEP_MIN;
  const startH = Math.floor(totalStartMin / 60);
  const startM = totalStartMin % 60;
  const [y, m, d] = date.split("-").map(Number);
  const startLocal = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, startH, startM, 0, 0);
  const endLocal = new Date(startLocal.getTime() + durationMin * 60_000);
  return {
    startIso: fromCalendarLocal(startLocal, orgTimeZone),
    endIso: fromCalendarLocal(endLocal, orgTimeZone),
  };
}

export default function GridScheduleView({
  implementation,
  sessions,
  classes,
  trainers,
  rooms,
  orgTimeZone,
  onOpenSession,
  onMoveSession,
}: Props) {
  const slots = useMemo(() => buildSlots(), []);
  const weekdays = useMemo(
    () =>
      buildWeekdays(implementation.window_start_date ?? "", implementation.window_end_date ?? ""),
    [implementation.window_start_date, implementation.window_end_date],
  );

  const classMap = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const trainerMap = useMemo(() => new Map(trainers.map((t) => [t.id, t])), [trainers]);

  const [zoom, setZoom] = useState<Zoom>("comfortable");

  if (weekdays.length === 0) {
    return (
      <div className="border-border bg-background text-muted-foreground rounded-xl border p-6 text-sm">
        Set window dates in Setup before viewing the grid.
      </div>
    );
  }

  const preset = ZOOM_PRESETS[zoom];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        <span className="text-muted-foreground text-[10px] font-medium uppercase tracking-wide">
          Zoom
        </span>
        <div className="border-border bg-background flex overflow-hidden rounded-md border">
          <button
            type="button"
            onClick={() => {
              setZoom("compact");
            }}
            className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium ${
              zoom === "compact"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-surface"
            }`}
            title="Compact: fit all rooms on one screen"
          >
            <MagnifyingGlassMinusIcon className="h-3 w-3" />
            Compact
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom("comfortable");
            }}
            className={`px-2 py-1 text-[10px] font-medium ${
              zoom === "comfortable"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-surface"
            }`}
          >
            Comfortable
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom("spacious");
            }}
            className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium ${
              zoom === "spacious"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-surface"
            }`}
            title="Spacious: easier to read"
          >
            <MagnifyingGlassPlusIcon className="h-3 w-3" />
            Spacious
          </button>
        </div>
      </div>
      <p className="text-muted-foreground text-[10.5px]">
        Drag any session to move it · click to edit · drop on an empty cell in any room
      </p>
      <div className="space-y-4">
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
            preset={preset}
            onOpenSession={onOpenSession}
            onMoveSession={onMoveSession}
          />
        ))}
      </div>
    </div>
  );
}

type Preset = (typeof ZOOM_PRESETS)[Zoom];

function RoomGrid({
  room,
  sessions,
  weekdays,
  slots,
  classMap,
  trainerMap,
  orgTimeZone,
  preset,
  onOpenSession,
  onMoveSession,
}: {
  room: ImplRoom;
  sessions: ImplSession[];
  weekdays: WeekDay[];
  slots: Slot[];
  classMap: Map<string, ImplClass>;
  trainerMap: Map<string, ImplTrainer>;
  orgTimeZone: string;
  preset: Preset;
  onOpenSession: (sessionId: string) => void;
  onMoveSession: Props["onMoveSession"];
}) {
  const placements = useMemo(
    () => buildPlacementsForRoom(sessions, room.id, weekdays, orgTimeZone, slots),
    [sessions, room.id, weekdays, orgTimeZone, slots],
  );
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

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

  function onDropTo(date: string, slotIdx: number, e: DragEvent<HTMLTableCellElement>) {
    e.preventDefault();
    setDragOverKey(null);
    const payload = e.dataTransfer.getData("application/json");
    if (!payload) return;
    let parsed: { sessionId: string; durationMin: number };
    try {
      parsed = JSON.parse(payload) as { sessionId: string; durationMin: number };
    } catch {
      return;
    }
    const { startIso, endIso } = dropToIso(date, slotIdx, parsed.durationMin, orgTimeZone);
    onMoveSession({
      sessionId: parsed.sessionId,
      newRoomId: room.id,
      newStartIso: startIso,
      newEndIso: endIso,
    });
  }

  return (
    <div className="border-border bg-background overflow-hidden rounded-xl border">
      <div className="border-border flex items-baseline justify-between border-b px-3 py-2">
        <div>
          <h3 className="text-foreground font-serif text-sm tracking-tight">{room.name}</h3>
          <p className="text-muted-foreground text-[10px]">
            Capacity {room.seat_capacity.toString()} seats · {totalSessions.toString()} session
            {totalSessions === 1 ? "" : "s"}
          </p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table
          className="w-full border-separate border-spacing-0"
          style={{ fontSize: preset.fontPx }}
        >
          <thead>
            <tr>
              <th
                className={`border-border bg-surface text-muted-foreground sticky left-0 z-10 border-b border-r text-left font-medium uppercase tracking-wide ${preset.pad}`}
                style={{ minWidth: 60 }}
              >
                Time
              </th>
              {weekdays.map((w) => (
                <th
                  key={w.date}
                  className={`border-border text-muted-foreground border-b border-r text-center font-medium uppercase tracking-wide ${preset.pad}`}
                  style={{ minWidth: preset.colMin }}
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
                <th
                  className={`border-border bg-surface text-muted-foreground sticky left-0 z-10 border-b border-r text-right font-normal tabular-nums ${preset.pad}`}
                  style={{ height: preset.rowH }}
                >
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
                        preset={preset}
                        onClick={() => {
                          onOpenSession(cell.placed.session.id);
                        }}
                      />
                    );
                  }
                  const key = `${w.date}|${slotIdx.toString()}`;
                  const isOver = dragOverKey === key;
                  return (
                    <td
                      key={w.date}
                      className={`border-border border-b border-r ${isOver ? "bg-primary/10" : ""}`}
                      style={{ height: preset.rowH }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        if (dragOverKey !== key) setDragOverKey(key);
                      }}
                      onDragLeave={() => {
                        if (dragOverKey === key) setDragOverKey(null);
                      }}
                      onDrop={(e) => {
                        onDropTo(w.date, slotIdx, e);
                      }}
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
  preset,
  onClick,
}: {
  placed: Placed;
  rowSpan: number;
  classMap: Map<string, ImplClass>;
  trainerMap: Map<string, ImplTrainer>;
  preset: Preset;
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
  const durationMin =
    (new Date(placed.session.scheduled_end).getTime() -
      new Date(placed.session.scheduled_start).getTime()) /
    60_000;

  return (
    <td
      rowSpan={rowSpan}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData(
          "application/json",
          JSON.stringify({ sessionId: placed.session.id, durationMin }),
        );
      }}
      onClick={onClick}
      className={`border-border cursor-grab border-b border-r align-top transition-opacity hover:opacity-80 active:cursor-grabbing ${conflictBorder} ${preset.pad}`}
      style={{ backgroundColor: bg }}
      title={[
        cls?.name ?? "—",
        trainer ? `Trainer: ${trainer.name}` : "No trainer",
        `${placed.session.learners_count.toString()} learners · ${placed.session.status}`,
        placed.session.conflict_reason ? `⚠ ${placed.session.conflict_reason}` : null,
        "Drag to move · click to edit",
      ]
        .filter((x): x is string => !!x)
        .join("\n")}
    >
      <div className="text-foreground line-clamp-2 font-medium leading-tight">
        {cls?.name ?? "—"}
      </div>
      {trainer && <div className="text-foreground/70 mt-0.5 leading-tight">{trainer.name}</div>}
    </td>
  );
}
