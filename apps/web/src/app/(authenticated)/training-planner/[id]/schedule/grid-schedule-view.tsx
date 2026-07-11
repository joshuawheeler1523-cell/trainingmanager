"use client";

import { useMemo, useState, type DragEvent } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
} from "@heroicons/react/20/solid";
import type { ImplClass, ImplRoom, ImplSession, ImplTrainer, Implementation } from "@arbor/shared";
import { toCalendarLocal, fromCalendarLocal } from "@/lib/timezone";
import { resolveClassColor } from "./class-palette";
import type { PoolDragPayload } from "./session-pool";
import { getActivePoolDrag } from "./active-pool-drag";
import {
  validateManualPlacement,
  type ValidationContext,
} from "@/lib/training-planner/manual-placement";

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
  /** Optional manual-placement hook. When provided (manual mode), the grid
   *  accepts drops from the SessionPool sidebar. Receives the validated
   *  candidate; the caller persists it via placeManualSession. */
  onPlaceFromPool?: (args: {
    classId: string;
    roomId: string;
    startLocalDate: string;
    startLocalHour: number;
  }) => void;
  /** Required when onPlaceFromPool is set — the unsaved working state the
   *  client-side validator runs against. Passed through from schedule-view
   *  so the pool's drag preview reflects all draft + published sessions. */
  classTrainers?: ValidationContext["classTrainers"];
  pto?: ValidationContext["pto"];
};

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

// Monday (UTC) of the ISO week a YYYY-MM-DD date falls in. Used to bucket the
// window's weekdays into one column-group per calendar week.
function mondayKey(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const offset = dow === 0 ? 6 : dow - 1; // days since Monday
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

// Group the flat, chronological weekday list into weeks so the grid can show
// one week at a time. Wide, hittable columns beat a 30-column window the user
// has to scroll sideways through — misdrops onto the wrong day were the whole
// reason a hand-placed session appeared to "jump" days.
function groupIntoWeeks(weekdays: WeekDay[]): WeekDay[][] {
  const weeks: WeekDay[][] = [];
  let curKey: string | null = null;
  for (const wd of weekdays) {
    const key = mondayKey(wd.date);
    if (key !== curKey) {
      weeks.push([]);
      curKey = key;
    }
    weeks[weeks.length - 1]?.push(wd);
  }
  return weeks;
}

function weekLabel(week: WeekDay[]): string {
  const first = week[0];
  const last = week[week.length - 1];
  if (!first || !last) return "";
  const fd = new Date(first.date + "T00:00:00Z");
  const ld = new Date(last.date + "T00:00:00Z");
  const mo = (d: Date) => d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  const year = ld.getUTCFullYear().toString();
  if (fd.getUTCMonth() === ld.getUTCMonth()) {
    return `${mo(fd)} ${fd.getUTCDate().toString()}–${ld.getUTCDate().toString()}, ${year}`;
  }
  return `${mo(fd)} ${fd.getUTCDate().toString()} – ${mo(ld)} ${ld.getUTCDate().toString()}, ${year}`;
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

// Slot index → fractional local hour (e.g. slot 2 with 30-min step starting
// at 7 AM → 8.0). The pool drop side needs the local-hour form because the
// validator works in calendar time, not UTC.
function slotIdxToLocalHour(slotIdx: number): number {
  const totalMin = SLOT_START_HOUR * 60 + slotIdx * SLOT_STEP_MIN;
  return totalMin / 60;
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
  onPlaceFromPool,
  classTrainers,
  pto,
}: Props) {
  const slots = useMemo(() => buildSlots(), []);
  const weekdays = useMemo(
    () =>
      buildWeekdays(implementation.window_start_date ?? "", implementation.window_end_date ?? ""),
    [implementation.window_start_date, implementation.window_end_date],
  );

  const weeks = useMemo(() => groupIntoWeeks(weekdays), [weekdays]);
  const [weekIdx, setWeekIdx] = useState(0);

  const classMap = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const trainerMap = useMemo(() => new Map(trainers.map((t) => [t.id, t])), [trainers]);

  // Shared validator context — only built when manual mode is wired in.
  // Declared above the early-return so the hook order stays stable.
  const validationCtx: ValidationContext | null = useMemo(() => {
    if (!onPlaceFromPool) return null;
    return {
      impl: implementation,
      classes,
      rooms,
      trainers,
      classTrainers: classTrainers ?? [],
      sessions,
      pto: pto ?? [],
      orgTimeZone,
    };
  }, [
    onPlaceFromPool,
    implementation,
    classes,
    rooms,
    trainers,
    classTrainers,
    sessions,
    pto,
    orgTimeZone,
  ]);

  const [zoom, setZoom] = useState<Zoom>("comfortable");

  if (weekdays.length === 0) {
    return (
      <div className="border-border bg-background text-muted-foreground rounded-xl border p-6 text-sm">
        Set window dates in Setup before viewing the grid.
      </div>
    );
  }

  const preset = ZOOM_PRESETS[zoom];
  const safeWeekIdx = Math.min(weekIdx, weeks.length - 1);
  const currentWeek = weeks[safeWeekIdx] ?? [];

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
      {/* Week pager — one week of wide, easy-to-hit columns at a time. A
          multi-week window used to render every weekday as a narrow column,
          which made it easy to drop a session one column off (onto the wrong
          day) with no error. */}
      <div className="border-border bg-background flex items-center justify-between gap-2 rounded-md border px-2 py-1.5">
        <button
          type="button"
          disabled={safeWeekIdx === 0}
          onClick={() => {
            setWeekIdx(Math.max(0, safeWeekIdx - 1));
          }}
          className="text-muted-foreground hover:bg-surface hover:text-foreground inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium disabled:opacity-30"
        >
          <ChevronLeftIcon className="h-4 w-4" />
          Prev week
        </button>
        <div className="text-foreground text-center text-xs font-medium tabular-nums">
          {weekLabel(currentWeek)}
          {weeks.length > 1 && (
            <span className="text-muted-foreground ml-2 font-normal">
              Week {(safeWeekIdx + 1).toString()} of {weeks.length.toString()}
            </span>
          )}
        </div>
        <button
          type="button"
          disabled={safeWeekIdx >= weeks.length - 1}
          onClick={() => {
            setWeekIdx(Math.min(weeks.length - 1, safeWeekIdx + 1));
          }}
          className="text-muted-foreground hover:bg-surface hover:text-foreground inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium disabled:opacity-30"
        >
          Next week
          <ChevronRightIcon className="h-4 w-4" />
        </button>
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
            weekdays={currentWeek}
            slots={slots}
            classMap={classMap}
            trainerMap={trainerMap}
            orgTimeZone={orgTimeZone}
            preset={preset}
            onOpenSession={onOpenSession}
            onMoveSession={onMoveSession}
            onPlaceFromPool={onPlaceFromPool}
            validationCtx={validationCtx}
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
  onPlaceFromPool,
  validationCtx,
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
  onPlaceFromPool: Props["onPlaceFromPool"];
  validationCtx: ValidationContext | null;
}) {
  const placements = useMemo(
    () => buildPlacementsForRoom(sessions, room.id, weekdays, orgTimeZone, slots),
    [sessions, room.id, weekdays, orgTimeZone, slots],
  );
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  // For pool drags, the hover preview needs to know whether THIS specific
  // cell would accept the drop — tinted green when valid, red when not.
  // Tracked separately so it doesn't fight the move-drag tint.
  const [poolHover, setPoolHover] = useState<{ key: string; ok: boolean; reason?: string } | null>(
    null,
  );

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
    setPoolHover(null);
    const payload = e.dataTransfer.getData("application/json");
    if (!payload) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== "object") return;
    const kind = (parsed as { kind?: string }).kind;

    if (kind === "pool") {
      if (!onPlaceFromPool) return;
      const pool = parsed as PoolDragPayload;
      const startLocalHour = slotIdxToLocalHour(slotIdx);
      onPlaceFromPool({
        classId: pool.classId,
        roomId: room.id,
        startLocalDate: date,
        startLocalHour,
      });
      return;
    }

    // Legacy payload: moving an already-placed session.
    const move = parsed as { sessionId?: string; durationMin?: number };
    if (typeof move.sessionId !== "string" || typeof move.durationMin !== "number") return;
    const { startIso, endIso } = dropToIso(date, slotIdx, move.durationMin, orgTimeZone);
    onMoveSession({
      sessionId: move.sessionId,
      newRoomId: room.id,
      newStartIso: startIso,
      newEndIso: endIso,
    });
  }

  // Validate a candidate pool drop against the shared validator. Cheap to
  // call per dragOver event — the validator runs in-memory over rows already
  // in props. The result drives both the cell tint and the cursor effect.
  function previewPoolDrop(
    classId: string,
    date: string,
    slotIdx: number,
  ): { ok: boolean; reason?: string } {
    if (!validationCtx) return { ok: false, reason: "Manual mode not enabled." };
    const startLocalHour = slotIdxToLocalHour(slotIdx);
    const result = validateManualPlacement(
      { classId, roomId: room.id, startLocalDate: date, startLocalHour },
      validationCtx,
    );
    if (result.ok) return { ok: true };
    const first = result.reasons[0];
    return first ? { ok: false, reason: first } : { ok: false };
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
                  // Pool preview wins visually when active — it carries the
                  // valid/invalid signal the user is shopping for.
                  const isPoolOver = poolHover?.key === key;
                  const poolOk = poolHover?.ok ?? false;
                  const cellBg = isPoolOver
                    ? poolOk
                      ? "bg-success/40"
                      : "bg-danger/40"
                    : isOver
                      ? "bg-primary/10"
                      : "";
                  return (
                    <td
                      key={w.date}
                      title={isPoolOver && !poolOk ? poolHover.reason : undefined}
                      className={`border-border border-b border-r ${cellBg}`}
                      style={{ height: preset.rowH }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        // Pool-mode preview path. The active pool drag is
                        // published to a module-level signal on dragStart
                        // because HTML5 DnD hides the dataTransfer payload
                        // until drop. The grid reads it here, validates the
                        // candidate against the shared validator, and tints
                        // the cell green/red.
                        const active = getActivePoolDrag();
                        if (active && validationCtx && onPlaceFromPool) {
                          const verdict = previewPoolDrop(active.classId, w.date, slotIdx);
                          e.dataTransfer.dropEffect = verdict.ok ? "copy" : "none";
                          if (!isPoolOver || poolOk !== verdict.ok) {
                            setPoolHover({
                              key,
                              ok: verdict.ok,
                              ...(verdict.reason ? { reason: verdict.reason } : {}),
                            });
                          }
                          return;
                        }
                        e.dataTransfer.dropEffect = "move";
                        if (dragOverKey !== key) setDragOverKey(key);
                      }}
                      onDragLeave={() => {
                        if (dragOverKey === key) setDragOverKey(null);
                        if (poolHover?.key === key) setPoolHover(null);
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
  const bg = resolveClassColor(placed.session.impl_class_id, cls?.color ?? null);
  const conflictBorder =
    placed.session.conflict_status === "full"
      ? "ring-2 ring-danger ring-inset"
      : placed.session.conflict_status === "partial"
        ? "ring-2 ring-warning ring-inset"
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
        // Pin the drag image so the cursor lines up with the TOP of the
        // block (not wherever the user happened to click inside it). On
        // drop, the cell the cursor is over IS the new top — making the
        // pre-drop preview match the post-drop placement exactly.
        e.dataTransfer.setDragImage(e.currentTarget, 4, 4);
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
