"use client";

import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Calendar, dateFnsLocalizer, type Event as CalEventBase } from "react-big-calendar";
import withDragAndDrop, {
  type EventInteractionArgs,
} from "react-big-calendar/lib/addons/dragAndDrop";
import { format, parse, startOfWeek, getDay, addDays } from "date-fns";
import { enUS } from "date-fns/locale";
import {
  ArrowDownTrayIcon,
  ArrowLeftIcon,
  ClipboardDocumentIcon,
  Cog6ToothIcon,
  DocumentDuplicateIcon,
  PlusIcon,
  QuestionMarkCircleIcon,
  SparklesIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/20/solid";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import type { SketchpadRoom, SketchpadSchedule, SketchpadSession } from "@arbor/shared";
import {
  bulkCreateSessions,
  createRoom,
  createSession,
  deleteRoom,
  autoScheduleSessions,
  deleteAllSessionsInSchedule,
  deleteSession,
  duplicateSession,
  recolorClassInSchedule,
  updateRoom,
  updateSchedule,
  updateSession,
} from "../actions";

type Props = {
  schedule: SketchpadSchedule;
  rooms: SketchpadRoom[];
  sessions: SketchpadSession[];
};

type CalResource = {
  sessionId: string;
  trainerName: string;
  className: string;
  roomId: string | null;
  conflictKind: "none" | "trainer" | "room" | "trainer-and-room" | "out-of-hours";
  conflictTooltip: string;
  color: string;
  groupSeq: { index: number; total: number } | null;
};

type CalEvent = Omit<CalEventBase, "resource"> & {
  resource: CalResource;
  resourceId?: string;
};

type SketchpadView = "day" | "week" | "month";

const fieldClass =
  "border-input bg-background text-foreground rounded-md border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

const locales = { "en-US": enUS };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales,
});
const DnDCalendar = withDragAndDrop<CalEvent>(Calendar);

const CLASS_PALETTE = [
  "#bfdbfe", // blue-200
  "#c7d2fe", // indigo-200
  "#ddd6fe", // violet-200
  "#e9d5ff", // purple-200
  "#f5d0fe", // fuchsia-200
  "#fbcfe8", // pink-200
  "#a5f3fc", // cyan-200
  "#99f6e4", // teal-200
  "#bae6fd", // sky-200
  "#fed7aa", // orange-200
  "#d9f99d", // lime-200
  "#e2e8f0", // slate-200
] as const;

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function colorForClass(name: string): string {
  const key = name.trim().toLowerCase();
  if (!key) return CLASS_PALETTE[0];
  const idx = hashString(key) % CLASS_PALETTE.length;
  return CLASS_PALETTE[idx] ?? CLASS_PALETTE[0];
}

// Date+time helpers — sketchpad runs entirely in browser-local time. We
// store as UTC ISO via Date.toISOString() and render via Date#toLocaleString.
function dayDate(scheduleStart: string, dayIndex: number): Date {
  // scheduleStart is "YYYY-MM-DD" — interpret as midnight local.
  const [y, m, d] = scheduleStart.split("-").map(Number);
  return addDays(new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1), dayIndex);
}

function ymd(d: Date): string {
  const y = d.getFullYear().toString();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysBetweenInclusive(startYmd: string, endYmd: string): number {
  // Returns the day_count corresponding to [start..end] inclusive (so a
  // single-day schedule = 1). Negative or invalid spans return 0.
  const [sy, sm, sd] = startYmd.split("-").map(Number);
  const [ey, em, ed] = endYmd.split("-").map(Number);
  const start = new Date(sy ?? 2026, (sm ?? 1) - 1, sd ?? 1);
  const end = new Date(ey ?? 2026, (em ?? 1) - 1, ed ?? 1);
  const diff = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  return diff < 0 ? 0 : diff + 1;
}

function formatDayLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function isoFor(day: Date, hour: number, minute: number): string {
  const d = new Date(day);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function isoForOffset(startIso: string, durationMinutes: number): string {
  const end = new Date(startIso);
  end.setMinutes(end.getMinutes() + durationMinutes);
  return end.toISOString();
}

// Two intervals [a1,a2) and [b1,b2) overlap iff a1 < b2 && b1 < a2.
function intervalsOverlap(a1: Date, a2: Date, b1: Date, b2: Date): boolean {
  return a1 < b2 && b1 < a2;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// ── Smart-paste ────────────────────────────────────────────────────────────
// Accepts tab- or comma-separated rows like:
//   "Smith\tEMR Provider\t9:00\t2h\tRoom A"
//   "Smith, EMR Provider, 09:00, 60min, Room A"
// Columns (in order): Trainer, Class, Start time (HH:MM or HH:MM AM/PM),
// Duration ("60", "60m", "60min", "1h", "1.5h", "2 hours"), Room (optional).
// Returns one ParsedRow per non-empty source line plus a list of human
// errors for lines that didn't parse cleanly.

type ParsedRow = {
  trainer_name: string;
  class_name: string;
  starts_at: string; // ISO
  ends_at: string; // ISO
  room_id: string | null;
};

function parsePasteText(
  raw: string,
  day: Date,
  rooms: { id: string; name: string }[],
): { rows: ParsedRow[]; errors: string[] } {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const errors: string[] = [];
  const rows: ParsedRow[] = [];
  const roomByName = new Map(rooms.map((r) => [r.name.trim().toLowerCase(), r.id]));

  lines.forEach((line, idx) => {
    const cols = (line.includes("\t") ? line.split("\t") : line.split(","))
      .map((c) => c.trim())
      .filter(Boolean);
    if (cols.length < 4) {
      errors.push(`Line ${(idx + 1).toString()}: need at least Trainer, Class, Start, Duration`);
      return;
    }
    const [trainer, klass, startStr, durationStr, roomStr] = cols;
    if (!trainer || !klass) {
      errors.push(`Line ${(idx + 1).toString()}: trainer and class required`);
      return;
    }
    const startMinutes = parseTimeToMinutes(startStr ?? "");
    if (startMinutes == null) {
      errors.push(`Line ${(idx + 1).toString()}: couldn't parse start time "${startStr ?? ""}"`);
      return;
    }
    const durMin = parseDurationToMinutes(durationStr ?? "");
    if (durMin == null || durMin <= 0) {
      errors.push(`Line ${(idx + 1).toString()}: couldn't parse duration "${durationStr ?? ""}"`);
      return;
    }
    const start = new Date(day);
    start.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
    const end = new Date(start);
    end.setMinutes(end.getMinutes() + durMin);
    const roomKey = roomStr?.trim().toLowerCase() ?? "";
    const roomId = roomKey ? (roomByName.get(roomKey) ?? null) : null;
    rows.push({
      trainer_name: trainer,
      class_name: klass,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      room_id: roomId,
    });
    if (roomStr && !roomId) {
      errors.push(
        `Line ${(idx + 1).toString()}: room "${roomStr}" not found — row imported as Unassigned`,
      );
    }
  });

  return { rows, errors };
}

function parseTimeToMinutes(raw: string): number | null {
  const m = /^(\d{1,2}):(\d{2})\s*(am|pm)?$/i.exec(raw.trim());
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const period = m[3]?.toLowerCase();
  if (period === "pm" && h < 12) h += 12;
  if (period === "am" && h === 12) h = 0;
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) {
    return null;
  }
  return h * 60 + min;
}

function parseDurationToMinutes(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  // bare number → minutes
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s));
  const minMatch = /^(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)$/.exec(s);
  if (minMatch?.[1]) return Math.round(Number(minMatch[1]));
  const hMatch = /^(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)$/.exec(s);
  if (hMatch?.[1]) return Math.round(Number(hMatch[1]) * 60);
  return null;
}

export default function SketchpadEditor({ schedule, rooms, sessions }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Optimistic layer over sessions — drag-drop / edits apply synchronously,
  // useOptimistic reverts on transition failure (no router.refresh).
  const [optimisticSessions, applyOptimisticPatch] = useOptimistic(
    sessions,
    (
      state,
      action: { kind: "upsert"; session: SketchpadSession } | { kind: "delete"; id: string },
    ) => {
      if (action.kind === "delete") return state.filter((s) => s.id !== action.id);
      const existing = state.findIndex((s) => s.id === action.session.id);
      if (existing >= 0) {
        const next = state.slice();
        next[existing] = action.session;
        return next;
      }
      return [...state, action.session];
    },
  );

  const [showSettings, setShowSettings] = useState(false);
  const [view, setView] = useState<SketchpadView>("day");
  const [selectedDay, setSelectedDay] = useState(0);
  const [drawerSessionId, setDrawerSessionId] = useState<string | null>(null);
  const [newRoomName, setNewRoomName] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [autoOpen, setAutoOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // Quick-add form state. Kept simple — one form for one new session at a time.
  const [qaTrainer, setQaTrainer] = useState("");
  const [qaClass, setQaClass] = useState("");
  const [qaDuration, setQaDuration] = useState("60");
  const [qaTime, setQaTime] = useState("09:00");
  const [qaRoomId, setQaRoomId] = useState<string>(rooms[0]?.id ?? "");

  const trainerInputRef = useRef<HTMLInputElement>(null);

  const days = useMemo(
    () => Array.from({ length: schedule.day_count }, (_, i) => dayDate(schedule.start_date, i)),
    [schedule.start_date, schedule.day_count],
  );
  const currentDay = days[selectedDay] ?? days[0] ?? dayDate(schedule.start_date, 0);

  // Detect conflicts across the WHOLE optimisticSessions list (not just the
  // visible day) so cross-day trainer conflicts also light up.
  const conflicts = useMemo(() => {
    const trainerHits = new Map<string, Set<string>>();
    const roomHits = new Map<string, Set<string>>();
    const outOfHours = new Set<string>();
    const detail = new Map<string, string[]>();

    function addReason(id: string, msg: string) {
      const list = detail.get(id) ?? [];
      list.push(msg);
      detail.set(id, list);
    }
    function addEdge(map: Map<string, Set<string>>, fromId: string, toId: string) {
      let set = map.get(fromId);
      if (!set) {
        set = new Set();
        map.set(fromId, set);
      }
      set.add(toId);
    }

    for (let i = 0; i < optimisticSessions.length; i++) {
      const a = optimisticSessions[i];
      if (!a) continue;
      const aStart = new Date(a.starts_at);
      const aEnd = new Date(a.ends_at);
      const startHour = aStart.getHours() + aStart.getMinutes() / 60;
      const endHour = aEnd.getHours() + aEnd.getMinutes() / 60;
      if (startHour < schedule.hours_start || endHour > schedule.hours_end) {
        outOfHours.add(a.id);
        addReason(
          a.id,
          `Outside the ${schedule.hours_start.toString()}:00–${schedule.hours_end.toString()}:00 window`,
        );
      }
      for (let j = i + 1; j < optimisticSessions.length; j++) {
        const b = optimisticSessions[j];
        if (!b) continue;
        const bStart = new Date(b.starts_at);
        const bEnd = new Date(b.ends_at);
        if (!intervalsOverlap(aStart, aEnd, bStart, bEnd)) continue;
        const trainerEq =
          a.trainer_name.trim().toLowerCase() === b.trainer_name.trim().toLowerCase();
        const roomEq = a.room_id !== null && a.room_id === b.room_id;
        if (trainerEq) {
          addEdge(trainerHits, a.id, b.id);
          addEdge(trainerHits, b.id, a.id);
          addReason(
            a.id,
            `Trainer "${a.trainer_name}" also in "${b.class_name}" at ${formatTime(b.starts_at)}`,
          );
          addReason(
            b.id,
            `Trainer "${b.trainer_name}" also in "${a.class_name}" at ${formatTime(a.starts_at)}`,
          );
        }
        if (roomEq) {
          addEdge(roomHits, a.id, b.id);
          addEdge(roomHits, b.id, a.id);
          const roomName = rooms.find((r) => r.id === a.room_id)?.name ?? "this room";
          addReason(a.id, `Room "${roomName}" double-booked with "${b.class_name}"`);
          addReason(b.id, `Room "${roomName}" double-booked with "${a.class_name}"`);
        }
      }
    }
    return { trainerHits, roomHits, outOfHours, detail };
  }, [optimisticSessions, rooms, schedule.hours_start, schedule.hours_end]);

  // Group sequence numbers — "n/N" stamped on every session sharing a
  // group_id, ordered by starts_at (then created_at, then id for stable
  // tie-breaks). Standalone sessions and 1-of-1 groups get no badge.
  const groupSeq = useMemo(() => {
    const buckets = new Map<string, SketchpadSession[]>();
    for (const s of optimisticSessions) {
      if (!s.group_id) continue;
      const list = buckets.get(s.group_id) ?? [];
      list.push(s);
      buckets.set(s.group_id, list);
    }
    const result = new Map<string, { index: number; total: number }>();
    for (const list of buckets.values()) {
      if (list.length < 2) continue;
      const sorted = list.slice().sort((a, b) => {
        const at = new Date(a.starts_at).getTime();
        const bt = new Date(b.starts_at).getTime();
        if (at !== bt) return at - bt;
        const ac = new Date(a.created_at).getTime();
        const bc = new Date(b.created_at).getTime();
        if (ac !== bc) return ac - bc;
        return a.id.localeCompare(b.id);
      });
      const total = sorted.length;
      sorted.forEach((s, i) => {
        result.set(s.id, { index: i + 1, total });
      });
    }
    return result;
  }, [optimisticSessions]);

  // Build CalEvents from sessions with a room. In Day view we filter to the
  // selected day so the rooms-as-columns layout makes sense; in Week / Month
  // we include the full session set and let react-big-calendar window it.
  // Unassigned sessions stay in the strip above the calendar regardless of view.
  const calendarEvents = useMemo<CalEvent[]>(() => {
    function kindFor(sessionId: string): CalResource["conflictKind"] {
      const t = conflicts.trainerHits.has(sessionId);
      const r = conflicts.roomHits.has(sessionId);
      if (t && r) return "trainer-and-room";
      if (t) return "trainer";
      if (r) return "room";
      if (conflicts.outOfHours.has(sessionId)) return "out-of-hours";
      return "none";
    }
    const roomById = new Map(rooms.map((r) => [r.id, r]));
    return optimisticSessions
      .filter((s): s is SketchpadSession & { room_id: string } => {
        if (s.room_id === null) return false;
        if (view === "day") return sameDay(new Date(s.starts_at), currentDay);
        return true;
      })
      .map((s) => {
        const kind = kindFor(s.id);
        const reasons = conflicts.detail.get(s.id) ?? [];
        const roomName = roomById.get(s.room_id)?.name ?? "—";
        const seq = groupSeq.get(s.id) ?? null;
        const seqPrefix = seq ? `${seq.index.toString()}/${seq.total.toString()} ` : "";
        // Day view groups by room column, so the title can be class-only.
        // Week / month have no room axis, so we prepend the room name.
        const title =
          view === "day"
            ? `${seqPrefix}${s.class_name}`
            : `${seqPrefix}${roomName} · ${s.class_name}`;
        return {
          title,
          start: new Date(s.starts_at),
          end: new Date(s.ends_at),
          resourceId: s.room_id,
          resource: {
            sessionId: s.id,
            trainerName: s.trainer_name,
            className: s.class_name,
            roomId: s.room_id,
            conflictKind: kind,
            conflictTooltip: [
              s.class_name +
                (seq ? ` (session ${seq.index.toString()} of ${seq.total.toString()})` : ""),
              `${formatTime(s.starts_at)} – ${formatTime(s.ends_at)}`,
              `Trainer: ${s.trainer_name}`,
              `Room: ${roomName}`,
              s.learner_count != null ? `${s.learner_count.toString()} learners` : null,
              ...reasons.map((r) => `⚠ ${r}`),
            ]
              .filter((x): x is string => !!x)
              .join("\n"),
            color: s.color ?? colorForClass(s.class_name),
            groupSeq: seq,
          },
        };
      });
  }, [optimisticSessions, currentDay, conflicts, rooms, view, groupSeq]);

  const unassignedSessions = useMemo(
    () => optimisticSessions.filter((s) => !s.room_id),
    [optimisticSessions],
  );

  const calendarResources = useMemo(
    () => rooms.map((r) => ({ resourceId: r.id, resourceTitle: r.name })),
    [rooms],
  );

  // Unique trainer names already used in this sketch — feeds the
  // <datalist> for autocomplete on the quick-add Trainer field.
  const trainerHistory = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of optimisticSessions) {
      const key = s.trainer_name.trim().toLowerCase();
      if (key && !seen.has(key)) seen.set(key, s.trainer_name.trim());
    }
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
  }, [optimisticSessions]);

  // Keyboard shortcuts:
  //   • `N` (not while typing) → focus the quick-add Trainer field
  //   • `Esc` → close drawer / paste modal / export menu / help
  //   • `?` → toggle the help overlay
  useEffect(() => {
    function isTypingTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (target.isContentEditable) return true;
      return false;
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (helpOpen) setHelpOpen(false);
        else if (autoOpen) setAutoOpen(false);
        else if (pasteOpen) setPasteOpen(false);
        else if (exportOpen) setExportOpen(false);
        else if (drawerSessionId) setDrawerSessionId(null);
        return;
      }
      if (isTypingTarget(e.target)) return;
      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        setHelpOpen((v) => !v);
        return;
      }
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        trainerInputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [autoOpen, drawerSessionId, exportOpen, helpOpen, pasteOpen]);

  // ── Mutations ────────────────────────────────────────────────────────────

  function patchSchedule(patch: Record<string, unknown>) {
    startTransition(async () => {
      const result = await updateSchedule(schedule.id, patch);
      if (!result.ok) toast.error(result.error.message);
      router.refresh();
    });
  }

  function renameSchedule(newName: string) {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === schedule.name) return;
    patchSchedule({ name: trimmed });
  }

  function handleAddRoom() {
    const name = newRoomName.trim();
    if (!name) return;
    startTransition(async () => {
      const result = await createRoom(schedule.id, { name });
      if (result.ok) {
        setNewRoomName("");
        if (!qaRoomId) setQaRoomId(result.data.id);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleDeleteRoom(id: string, name: string) {
    if (!confirm(`Delete room "${name}"? Sessions assigned to it will move to Unassigned.`)) return;
    startTransition(async () => {
      const result = await deleteRoom(id, schedule.id);
      if (!result.ok) toast.error(result.error.message);
      router.refresh();
    });
  }

  function handleRenameRoom(id: string, newName: string) {
    const v = newName.trim();
    if (!v) return;
    startTransition(async () => {
      const result = await updateRoom(id, schedule.id, { name: v });
      if (!result.ok) toast.error(result.error.message);
      router.refresh();
    });
  }

  function handleQuickAdd() {
    const trainer = qaTrainer.trim();
    const klass = qaClass.trim();
    if (!trainer || !klass) {
      toast.error("Trainer and class are required");
      return;
    }
    const duration = Number(qaDuration);
    if (!Number.isFinite(duration) || duration <= 0) {
      toast.error("Duration must be positive");
      return;
    }
    const [hh, mm] = qaTime.split(":").map(Number);
    const startIso = isoFor(currentDay, hh ?? 0, mm ?? 0);
    const endIso = isoForOffset(startIso, duration);

    startTransition(async () => {
      // Optimistic: insert a placeholder with a temp id so the user sees
      // the block land immediately. useOptimistic auto-reverts on failure.
      const tempId = `temp-${Date.now().toString()}`;
      applyOptimisticPatch({
        kind: "upsert",
        session: {
          id: tempId,
          schedule_id: schedule.id,
          room_id: qaRoomId || null,
          org_id: schedule.org_id,
          trainer_name: trainer,
          class_name: klass,
          starts_at: startIso,
          ends_at: endIso,
          learner_count: null,
          notes: null,
          color: null,
          group_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      });
      const result = await createSession(schedule.id, {
        room_id: qaRoomId || null,
        trainer_name: trainer,
        class_name: klass,
        starts_at: startIso,
        ends_at: endIso,
      });
      if (result.ok) {
        // Reset Class but keep Trainer / Duration / Room / Time so a planner
        // can rapid-fire add a series of sessions for the same trainer.
        setQaClass("");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function commitSessionMove(sessionId: string, patch: Partial<SketchpadSession>) {
    const existing = optimisticSessions.find((s) => s.id === sessionId);
    if (!existing) return;
    const next: SketchpadSession = { ...existing, ...patch, updated_at: new Date().toISOString() };
    startTransition(async () => {
      applyOptimisticPatch({ kind: "upsert", session: next });
      const result = await updateSession(sessionId, schedule.id, {
        ...(patch.starts_at !== undefined ? { starts_at: patch.starts_at } : {}),
        ...(patch.ends_at !== undefined ? { ends_at: patch.ends_at } : {}),
        ...(patch.room_id !== undefined ? { room_id: patch.room_id } : {}),
        ...(patch.trainer_name !== undefined ? { trainer_name: patch.trainer_name } : {}),
        ...(patch.class_name !== undefined ? { class_name: patch.class_name } : {}),
        ...(patch.learner_count !== undefined ? { learner_count: patch.learner_count } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      });
      if (result.ok) {
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleEventDrop(args: EventInteractionArgs<CalEvent>) {
    const { event, start, end, resourceId } = args;
    const startDate = start instanceof Date ? start : new Date(start);
    const endDate = end instanceof Date ? end : new Date(end);
    commitSessionMove(event.resource.sessionId, {
      starts_at: startDate.toISOString(),
      ends_at: endDate.toISOString(),
      room_id: typeof resourceId === "string" ? resourceId : event.resource.roomId,
    });
  }

  function handleEventResize(args: EventInteractionArgs<CalEvent>) {
    const { event, start, end } = args;
    const startDate = start instanceof Date ? start : new Date(start);
    const endDate = end instanceof Date ? end : new Date(end);
    commitSessionMove(event.resource.sessionId, {
      starts_at: startDate.toISOString(),
      ends_at: endDate.toISOString(),
    });
  }

  function handleAssignUnassigned(sessionId: string, roomId: string) {
    commitSessionMove(sessionId, {
      room_id: roomId,
      // Snap to the selected day at the current quick-add time if the
      // session's date doesn't match the visible day.
      ...((): { starts_at?: string; ends_at?: string } => {
        const s = optimisticSessions.find((x) => x.id === sessionId);
        if (!s) return {};
        const startDate = new Date(s.starts_at);
        if (sameDay(startDate, currentDay)) return {};
        const durMin = (new Date(s.ends_at).getTime() - startDate.getTime()) / 60000;
        const [hh, mm] = qaTime.split(":").map(Number);
        const newStart = isoFor(currentDay, hh ?? 9, mm ?? 0);
        return { starts_at: newStart, ends_at: isoForOffset(newStart, durMin) };
      })(),
    });
  }

  function handleAutoSchedule(request: {
    className: string;
    trainerName: string | null;
    durationMinutes: number;
    count: number;
    learnerCount: number | null;
    preferredRoomId: string | null;
    preferredStartMinutes: number | null;
    distribution: "one-per-day" | "fill-earliest";
  }) {
    startTransition(async () => {
      const result = await autoScheduleSessions(schedule.id, request);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      const { inserted, unplaced, gaps } = result.data;
      if (inserted === 0) {
        toast.error(gaps[0] ?? "Could not place any sessions in this window");
      } else if (unplaced.length > 0) {
        toast.success(
          `Placed ${inserted.toString()} of ${request.count.toString()} — ${
            gaps[0] ?? `${unplaced.length.toString()} unplaced`
          }`,
        );
      } else {
        toast.success(`Placed ${inserted.toString()} session${inserted === 1 ? "" : "s"}`);
      }
      setAutoOpen(false);
      router.refresh();
    });
  }

  function handleBulkPaste(rawText: string): { inserted: number; errors: string[] } | null {
    const { rows, errors } = parsePasteText(rawText, currentDay, rooms);
    if (rows.length === 0) {
      toast.error(errors[0] ?? "Nothing parsed — check the format");
      return null;
    }
    startTransition(async () => {
      const result = await bulkCreateSessions(schedule.id, rows);
      if (result.ok) {
        toast.success(
          `Imported ${result.data.inserted.toString()} session${
            result.data.inserted === 1 ? "" : "s"
          }`,
        );
        setPasteOpen(false);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
    return { inserted: rows.length, errors };
  }

  function handleRecolorClass(className: string, color: string | null) {
    startTransition(async () => {
      // Optimistic: recolor every matching session in place.
      for (const s of optimisticSessions) {
        if (s.class_name === className) {
          applyOptimisticPatch({ kind: "upsert", session: { ...s, color } });
        }
      }
      const result = await recolorClassInSchedule(schedule.id, className, color);
      if (result.ok) {
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleDuplicateSession(sourceId: string) {
    const source = optimisticSessions.find((s) => s.id === sourceId);
    if (!source) return;

    // Compute the optimistic placement client-side so the new block lands
    // before the round-trip. Mirrors the server's logic in duplicateSession.
    const sourceStart = new Date(source.starts_at);
    const sourceEnd = new Date(source.ends_at);
    const sourceDay = new Date(
      sourceStart.getFullYear(),
      sourceStart.getMonth(),
      sourceStart.getDate(),
    );
    const [sy, sm, sd] = schedule.start_date.split("-").map(Number);
    const scheduleStart = new Date(sy ?? 2026, (sm ?? 1) - 1, sd ?? 1);
    const dayIndex = Math.round(
      (sourceDay.getTime() - scheduleStart.getTime()) / (24 * 60 * 60 * 1000),
    );
    const advance = dayIndex < schedule.day_count - 1 ? 1 : 0;
    const offset = advance * 24 * 60 * 60 * 1000;
    const newStart = new Date(sourceStart.getTime() + offset).toISOString();
    const newEnd = new Date(sourceEnd.getTime() + offset).toISOString();

    startTransition(async () => {
      const optimisticGroupId = source.group_id ?? `temp-group-${Date.now().toString()}`;
      if (!source.group_id) {
        applyOptimisticPatch({
          kind: "upsert",
          session: { ...source, group_id: optimisticGroupId },
        });
      }
      const tempId = `temp-${Date.now().toString()}`;
      applyOptimisticPatch({
        kind: "upsert",
        session: {
          ...source,
          id: tempId,
          group_id: optimisticGroupId,
          starts_at: newStart,
          ends_at: newEnd,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      });
      const result = await duplicateSession(sourceId, schedule.id);
      if (result.ok) {
        // Jump the visible day to where the copy landed, otherwise a same-time-
        // next-day copy can feel like nothing happened in Day view.
        const newDayDate = new Date(result.data.copy.starts_at);
        const idx = days.findIndex((d) => sameDay(d, newDayDate));
        if (idx >= 0 && idx !== selectedDay) setSelectedDay(idx);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleClearAllSessions() {
    const total = optimisticSessions.length;
    if (total === 0) {
      toast.error("No sessions to clear");
      return;
    }
    if (
      !confirm(
        `Delete all ${total.toString()} session${
          total === 1 ? "" : "s"
        } from this sketch? Rooms and schedule settings are kept.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      for (const s of optimisticSessions) {
        applyOptimisticPatch({ kind: "delete", id: s.id });
      }
      const result = await deleteAllSessionsInSchedule(schedule.id);
      if (result.ok) {
        setDrawerSessionId(null);
        toast.success(
          `Deleted ${result.data.deleted.toString()} session${
            result.data.deleted === 1 ? "" : "s"
          }`,
        );
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleDeleteSession(id: string) {
    if (!confirm("Delete this session?")) return;
    startTransition(async () => {
      applyOptimisticPatch({ kind: "delete", id });
      const result = await deleteSession(id, schedule.id);
      if (result.ok) {
        setDrawerSessionId(null);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  const minOfDay = new Date(0, 0, 0, schedule.hours_start, 0, 0);
  const maxOfDay = new Date(0, 0, 0, schedule.hours_end, 0, 0);
  const openSession = drawerSessionId
    ? optimisticSessions.find((s) => s.id === drawerSessionId)
    : null;

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Link
            href="/sketchpad"
            className="text-muted-foreground hover:text-foreground mb-1 inline-flex items-center gap-1 text-xs"
          >
            <ArrowLeftIcon className="h-3.5 w-3.5" />
            All sketches
          </Link>
          <input
            defaultValue={schedule.name}
            onBlur={(e) => {
              renameSchedule(e.target.value);
            }}
            disabled={pending}
            className="text-foreground focus:ring-ring -mx-1 w-full rounded bg-transparent px-1 text-xl font-semibold focus:outline-none focus:ring-2"
          />
          <p className="text-muted-foreground mt-1 text-xs">
            {schedule.start_date} · {schedule.day_count.toString()} day
            {schedule.day_count === 1 ? "" : "s"} · {schedule.hours_start.toString()}:00–
            {schedule.hours_end.toString()}:00 · {rooms.length.toString()} room
            {rooms.length === 1 ? "" : "s"} · {optimisticSessions.length.toString()} session
            {optimisticSessions.length === 1 ? "" : "s"}
            {unassignedSessions.length > 0 &&
              ` (${unassignedSessions.length.toString()} unassigned)`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div
            role="tablist"
            aria-label="Calendar view"
            className="border-border bg-background inline-flex rounded-md border p-0.5"
          >
            {(["day", "week", "month"] as const).map((v) => {
              const active = view === v;
              return (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    setView(v);
                  }}
                  className={`rounded px-2.5 py-1 text-xs font-medium capitalize ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-surface"
                  }`}
                >
                  {v}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => {
              setHelpOpen(true);
            }}
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (?)"
            className="border-border bg-background hover:bg-surface inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs font-medium"
          >
            <QuestionMarkCircleIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setPasteOpen(true);
            }}
            className="border-border bg-background hover:bg-surface inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium"
          >
            <ClipboardDocumentIcon className="h-3.5 w-3.5" />
            Paste
          </button>
          <button
            type="button"
            onClick={() => {
              setAutoOpen(true);
            }}
            className="border-border bg-background hover:bg-surface inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium"
          >
            <SparklesIcon className="h-3.5 w-3.5" />
            Auto-schedule
          </button>
          <button
            type="button"
            onClick={() => {
              setShowSettings((v) => !v);
            }}
            className="border-border bg-background hover:bg-surface inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium"
          >
            <Cog6ToothIcon className="h-3.5 w-3.5" />
            Settings
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setExportOpen((v) => !v);
              }}
              className="border-border bg-background hover:bg-surface inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium"
            >
              <ArrowDownTrayIcon className="h-3.5 w-3.5" />
              Export
            </button>
            {exportOpen && (
              <div
                className="border-border bg-background absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-md border shadow-lg"
                role="menu"
              >
                <a
                  href={`/api/sketchpad/${schedule.id}/schedule.xlsx?format=byday`}
                  className="hover:bg-surface block px-3 py-2 text-xs"
                  onClick={() => {
                    setExportOpen(false);
                  }}
                >
                  <span className="text-foreground font-medium">Excel — by day</span>
                  <span className="text-muted-foreground mt-0.5 block text-[11px]">
                    One sheet per day, rooms as columns
                  </span>
                </a>
                <a
                  href={`/api/sketchpad/${schedule.id}/schedule.xlsx?format=bysession`}
                  className="hover:bg-surface border-border block border-t px-3 py-2 text-xs"
                  onClick={() => {
                    setExportOpen(false);
                  }}
                >
                  <span className="text-foreground font-medium">Excel — by session</span>
                  <span className="text-muted-foreground mt-0.5 block text-[11px]">
                    Flat table, one row per session
                  </span>
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setExportOpen(false);
                    window.print();
                  }}
                  className="hover:bg-surface border-border block w-full border-t px-3 py-2 text-left text-xs"
                >
                  <span className="text-foreground font-medium">Print / save as PDF</span>
                  <span className="text-muted-foreground mt-0.5 block text-[11px]">
                    Uses your browser&apos;s print dialog
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {showSettings && (
        <SettingsPanel
          schedule={schedule}
          rooms={rooms}
          pending={pending}
          newRoomName={newRoomName}
          sessionCount={optimisticSessions.length}
          onRoomNameChange={setNewRoomName}
          onPatch={patchSchedule}
          onAddRoom={handleAddRoom}
          onRenameRoom={handleRenameRoom}
          onDeleteRoom={handleDeleteRoom}
          onClearAllSessions={handleClearAllSessions}
        />
      )}

      {/* Day tabs — full-width strip in Day view; in Week/Month they act as an
          anchor for the calendar plus the target day for quick-add. */}
      <div className="border-border bg-background flex flex-wrap items-center gap-1 rounded-lg border p-2">
        {view !== "day" && (
          <span className="text-muted-foreground mr-1 px-1 text-[11px] uppercase tracking-wide">
            Anchor day
          </span>
        )}
        {days.map((d, i) => {
          const active = i === selectedDay;
          const dayCount = optimisticSessions.filter((s) =>
            sameDay(new Date(s.starts_at), d),
          ).length;
          return (
            <button
              key={i}
              type="button"
              onClick={() => {
                setSelectedDay(i);
              }}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-surface"
              }`}
            >
              {formatDayLabel(d)}
              {dayCount > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                    active ? "bg-primary-foreground/20" : "bg-surface text-foreground"
                  }`}
                >
                  {dayCount.toString()}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Quick-add bar */}
      <div className="border-border bg-background grid grid-cols-1 gap-2 rounded-lg border p-3 md:grid-cols-[1.5fr_1.5fr_80px_100px_1.5fr_auto]">
        <div>
          <label
            htmlFor="qa-trainer"
            className="text-muted-foreground mb-0.5 block text-[10px] font-medium uppercase tracking-wide"
          >
            Trainer
          </label>
          <input
            id="qa-trainer"
            ref={trainerInputRef}
            value={qaTrainer}
            onChange={(e) => {
              setQaTrainer(e.target.value);
            }}
            list="sketchpad-trainer-history"
            placeholder="e.g., Smith"
            className={fieldClass + " w-full"}
            disabled={pending}
          />
          <datalist id="sketchpad-trainer-history">
            {trainerHistory.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="text-muted-foreground mb-0.5 block text-[10px] font-medium uppercase tracking-wide">
            Class
          </label>
          <input
            value={qaClass}
            onChange={(e) => {
              setQaClass(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleQuickAdd();
              }
            }}
            placeholder="e.g., EMR Provider"
            className={fieldClass + " w-full"}
            disabled={pending}
          />
        </div>
        <div>
          <label className="text-muted-foreground mb-0.5 block text-[10px] font-medium uppercase tracking-wide">
            Min
          </label>
          <input
            type="number"
            value={qaDuration}
            min={5}
            step={5}
            onChange={(e) => {
              setQaDuration(e.target.value);
            }}
            className={fieldClass + " w-full tabular-nums"}
            disabled={pending}
          />
        </div>
        <div>
          <label className="text-muted-foreground mb-0.5 block text-[10px] font-medium uppercase tracking-wide">
            Time
          </label>
          <input
            type="time"
            value={qaTime}
            onChange={(e) => {
              setQaTime(e.target.value);
            }}
            className={fieldClass + " w-full tabular-nums"}
            disabled={pending}
          />
        </div>
        <div>
          <label className="text-muted-foreground mb-0.5 block text-[10px] font-medium uppercase tracking-wide">
            Room
          </label>
          <select
            value={qaRoomId}
            onChange={(e) => {
              setQaRoomId(e.target.value);
            }}
            className={fieldClass + " w-full"}
            disabled={pending || rooms.length === 0}
          >
            {rooms.length === 0 ? (
              <option value="">Add a room first</option>
            ) : (
              <>
                <option value="">— Unassigned —</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </>
            )}
          </select>
        </div>
        <div className="flex items-end">
          <button
            type="button"
            disabled={pending || !qaTrainer.trim() || !qaClass.trim()}
            onClick={handleQuickAdd}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-[34px] items-center gap-1 rounded-md px-3 text-sm font-medium disabled:opacity-50"
          >
            <PlusIcon className="h-4 w-4" />
            Add
          </button>
        </div>
      </div>

      {/* Unassigned strip */}
      {unassignedSessions.length > 0 && (
        <div className="border-border rounded-lg border bg-amber-50/40 p-3 dark:bg-amber-900/10">
          <p className="text-foreground mb-1.5 text-xs font-semibold">
            Unassigned ({unassignedSessions.length.toString()})
          </p>
          <div className="flex flex-wrap gap-2">
            {unassignedSessions.map((s) => (
              <UnassignedPill
                key={s.id}
                session={s}
                rooms={rooms}
                pending={pending}
                groupSeq={groupSeq.get(s.id) ?? null}
                onOpen={() => {
                  setDrawerSessionId(s.id);
                }}
                onAssign={(roomId) => {
                  handleAssignUnassigned(s.id, roomId);
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Calendar grid */}
      <div className="border-border bg-background rounded-lg border p-3" style={{ height: 720 }}>
        {rooms.length === 0 ? (
          <div className="text-muted-foreground flex h-full items-center justify-center text-sm italic">
            Add at least one room (Settings → Rooms) to start placing sessions.
          </div>
        ) : (
          <DnDCalendar
            localizer={localizer}
            events={calendarEvents}
            startAccessor="start"
            endAccessor="end"
            views={view === "day" ? ["day"] : view === "week" ? ["work_week"] : ["month"]}
            defaultView={view === "day" ? "day" : view === "week" ? "work_week" : "month"}
            view={view === "day" ? "day" : view === "week" ? "work_week" : "month"}
            onView={() => {
              // View transitions are driven by our toggle above, not by RBC.
            }}
            date={currentDay}
            onNavigate={(newDate) => {
              // Week / Month toolbars expose prev / next. Sync the anchor day
              // index so quick-add targets a sensible day after navigation.
              if (newDate instanceof Date) {
                const idx = days.findIndex((d) => sameDay(d, newDate));
                if (idx >= 0) setSelectedDay(idx);
              }
            }}
            toolbar={view !== "day"}
            // Resources (rooms-as-columns) only make sense in Day view. Week /
            // Month use days as the column axis; room is shown in the event title.
            {...(view === "day"
              ? {
                  resources: calendarResources,
                  resourceIdAccessor: (r: object) => (r as { resourceId: string }).resourceId,
                  resourceTitleAccessor: (r: object) =>
                    (r as { resourceTitle: string }).resourceTitle,
                }
              : {})}
            tooltipAccessor={(event: CalEvent) => event.resource.conflictTooltip}
            min={minOfDay}
            max={maxOfDay}
            step={schedule.slot_minutes}
            timeslots={Math.max(1, Math.floor(60 / schedule.slot_minutes))}
            onSelectEvent={(event) => {
              setDrawerSessionId(event.resource.sessionId);
            }}
            onEventDrop={handleEventDrop}
            onEventResize={handleEventResize}
            resizable
            components={{
              event: (props: { event: CalEvent; title: string }) => (
                <CalendarEventBlock
                  event={props.event}
                  title={props.title}
                  onDuplicate={handleDuplicateSession}
                  disabled={pending}
                />
              ),
            }}
            eventPropGetter={(event: CalEvent) => {
              const kind = event.resource.conflictKind;
              const borderColor =
                kind === "trainer" || kind === "trainer-and-room"
                  ? "#e11d48" // rose-600
                  : kind === "room"
                    ? "#f59e0b" // amber-500
                    : kind === "out-of-hours"
                      ? "#64748b" // slate-500
                      : "transparent";
              const hasBorder = kind !== "none";
              return {
                style: {
                  backgroundColor: event.resource.color,
                  borderLeft: hasBorder ? `4px solid ${borderColor}` : "none",
                  borderTop: hasBorder ? `1px solid ${borderColor}` : "none",
                  borderRight: hasBorder ? `1px solid ${borderColor}` : "none",
                  borderBottom: hasBorder ? `1px solid ${borderColor}` : "none",
                  color: "#0f172a",
                },
              };
            }}
            style={{ height: "100%" }}
          />
        )}
      </div>

      <p className="text-muted-foreground text-[11px]">
        Times are in your browser&apos;s local timezone. Drag a session to move or resize. Click for
        details. Trainer overlap = rose border. Room overlap = amber. Outside the day window =
        slate.
        {view !== "day" && " Switch to Day view to see rooms as columns."}
      </p>

      {openSession && (
        <SessionDrawer
          session={openSession}
          rooms={rooms}
          days={days}
          pending={pending}
          conflictTooltip={conflicts.detail.get(openSession.id) ?? []}
          groupSeq={groupSeq.get(openSession.id) ?? null}
          siblingClassCount={
            optimisticSessions.filter((s) => s.class_name === openSession.class_name).length
          }
          onClose={() => {
            setDrawerSessionId(null);
          }}
          onPatch={(patch) => {
            commitSessionMove(openSession.id, patch);
          }}
          onDelete={() => {
            handleDeleteSession(openSession.id);
          }}
          onDuplicate={() => {
            handleDuplicateSession(openSession.id);
          }}
          onRecolorClass={(color) => {
            handleRecolorClass(openSession.class_name, color);
          }}
        />
      )}

      {pasteOpen && (
        <PasteModal
          dayLabel={formatDayLabel(currentDay)}
          rooms={rooms}
          pending={pending}
          onClose={() => {
            setPasteOpen(false);
          }}
          onSubmit={handleBulkPaste}
        />
      )}

      {autoOpen && (
        <AutoScheduleModal
          rooms={rooms}
          trainerHistory={trainerHistory}
          pending={pending}
          onClose={() => {
            setAutoOpen(false);
          }}
          onSubmit={handleAutoSchedule}
        />
      )}

      {helpOpen && (
        <HelpOverlay
          onClose={() => {
            setHelpOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ── Subcomponents ──────────────────────────────────────────────────────────

function CalendarEventBlock({
  event,
  title,
  onDuplicate,
  disabled,
}: {
  event: CalEvent;
  title: string;
  onDuplicate: (sessionId: string) => void;
  disabled: boolean;
}) {
  // Don't render a copy button on the in-flight optimistic placeholder —
  // it has no server id yet, so the action would 404.
  const isOptimistic = event.resource.sessionId.startsWith("temp-");
  return (
    <div className="flex h-full min-w-0 items-start justify-between gap-1">
      <span className="min-w-0 flex-1 truncate">{title}</span>
      {!isOptimistic && (
        <button
          type="button"
          onMouseDown={(e) => {
            // Stop RBC from initiating a drag from the icon and from opening
            // the drawer (onSelectEvent fires on click).
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate(event.resource.sessionId);
          }}
          disabled={disabled}
          aria-label="Duplicate this session"
          title="Duplicate (same time, next day)"
          className="-mr-0.5 -mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded text-current opacity-70 hover:bg-black/15 hover:opacity-100 disabled:opacity-30"
        >
          <DocumentDuplicateIcon className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function SettingsPanel({
  schedule,
  rooms,
  pending,
  newRoomName,
  sessionCount,
  onRoomNameChange,
  onPatch,
  onAddRoom,
  onRenameRoom,
  onDeleteRoom,
  onClearAllSessions,
}: {
  schedule: SketchpadSchedule;
  rooms: SketchpadRoom[];
  pending: boolean;
  newRoomName: string;
  sessionCount: number;
  onRoomNameChange: (v: string) => void;
  onPatch: (patch: Record<string, unknown>) => void;
  onAddRoom: () => void;
  onRenameRoom: (id: string, name: string) => void;
  onDeleteRoom: (id: string, name: string) => void;
  onClearAllSessions: () => void;
}) {
  return (
    <div className="border-border bg-background space-y-3 rounded-lg border p-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SettingField
          label="Start date"
          helper="The first day of the schedule. The day tabs and grid anchor here."
          type="date"
          defaultValue={schedule.start_date}
          disabled={pending}
          onCommit={(v) => {
            onPatch({ start_date: v });
          }}
        />
        <SettingField
          key={`end-${schedule.start_date}-${schedule.day_count.toString()}`}
          label="End date"
          helper="The last day of the schedule (inclusive). Day tabs render between Start date and this date. Up to 90 days."
          type="date"
          min={schedule.start_date}
          defaultValue={ymd(addDays(dayDate(schedule.start_date, 0), schedule.day_count - 1))}
          disabled={pending}
          onCommit={(v) => {
            const dc = daysBetweenInclusive(schedule.start_date, v);
            if (dc < 1) {
              toast.error("End date must be on or after the Start date");
              return;
            }
            if (dc > 90) {
              toast.error("Schedules can be at most 90 days");
              return;
            }
            onPatch({ day_count: dc });
          }}
        />
        <SettingField
          label="Day start"
          helper="The hour the day grid begins, in 24-hour time. 7 = 7:00 AM, 13 = 1:00 PM."
          type="number"
          min={0}
          max={23}
          defaultValue={schedule.hours_start.toString()}
          disabled={pending}
          onCommit={(v) => {
            onPatch({ hours_start: Number(v) });
          }}
        />
        <SettingField
          label="Day end"
          helper="The hour the day grid ends, in 24-hour time. 17 = 5:00 PM, 19 = 7:00 PM."
          type="number"
          min={1}
          max={24}
          defaultValue={schedule.hours_end.toString()}
          disabled={pending}
          onCommit={(v) => {
            onPatch({ hours_end: Number(v) });
          }}
        />
        <div className="col-span-2">
          <label
            htmlFor="slot-minutes"
            className="text-muted-foreground mb-1 block text-xs font-medium uppercase tracking-wide"
          >
            Slot size
          </label>
          <select
            id="slot-minutes"
            defaultValue={schedule.slot_minutes.toString()}
            disabled={pending}
            onChange={(e) => {
              onPatch({ slot_minutes: Number(e.target.value) });
            }}
            className={fieldClass + " w-full"}
          >
            <option value="15">15 minutes</option>
            <option value="30">30 minutes</option>
            <option value="60">60 minutes</option>
          </select>
        </div>
        <div className="col-span-2 md:col-span-4">
          <label
            htmlFor="notes"
            className="text-muted-foreground mb-1 block text-xs font-medium uppercase tracking-wide"
          >
            Notes
          </label>
          <textarea
            id="notes"
            defaultValue={schedule.notes ?? ""}
            disabled={pending}
            rows={2}
            onBlur={(e) => {
              onPatch({ notes: e.target.value });
            }}
            className={fieldClass + " w-full"}
          />
        </div>
      </div>

      <div className="border-border border-t pt-3">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-foreground text-xs font-semibold uppercase tracking-wide">Rooms</h3>
          <p className="text-muted-foreground text-[11px]">
            Each room becomes a column in the day grid.
          </p>
        </div>
        {rooms.length === 0 ? (
          <p className="text-muted-foreground text-xs italic">
            No rooms yet. Add at least one to start placing sessions.
          </p>
        ) : (
          <ul className="divide-border divide-y">
            {rooms.map((r) => (
              <li key={r.id} className="flex items-center gap-2 py-1.5">
                <input
                  defaultValue={r.name}
                  disabled={pending}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== r.name) onRenameRoom(r.id, v);
                  }}
                  className={fieldClass + " flex-1"}
                />
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    onDeleteRoom(r.id, r.name);
                  }}
                  aria-label={`Delete ${r.name}`}
                  className="text-muted-foreground hover:text-destructive rounded p-1 disabled:opacity-50"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex items-end gap-2">
          <input
            value={newRoomName}
            onChange={(e) => {
              onRoomNameChange(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onAddRoom();
              }
            }}
            placeholder="Room name (e.g., Sim Lab A)"
            className={fieldClass + " flex-1"}
            disabled={pending}
          />
          <button
            type="button"
            disabled={pending || !newRoomName.trim()}
            onClick={onAddRoom}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            <PlusIcon className="h-4 w-4" />
            Add room
          </button>
        </div>
      </div>

      <div className="border-border border-t pt-3">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-foreground text-xs font-semibold uppercase tracking-wide">
            Danger zone
          </h3>
          <p className="text-muted-foreground text-[11px]">
            Destructive operations. Confirmation required.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onClearAllSessions}
            disabled={pending || sessionCount === 0}
            className="border-destructive/50 text-destructive hover:bg-destructive/10 inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            <TrashIcon className="h-3.5 w-3.5" />
            Clear all sessions
            {sessionCount > 0 && (
              <span className="bg-destructive/10 text-destructive ml-1 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums">
                {sessionCount.toString()}
              </span>
            )}
          </button>
          <p className="text-muted-foreground text-[11px]">
            Removes every session block from the calendar. Rooms and schedule settings are kept.
          </p>
        </div>
      </div>
    </div>
  );
}

function SettingField({
  label,
  helper,
  type,
  defaultValue,
  disabled,
  onCommit,
  min,
  max,
}: {
  label: string;
  helper?: string;
  type: "date" | "number";
  defaultValue: string;
  disabled: boolean;
  onCommit: (v: string) => void;
  min?: number | string;
  max?: number | string;
}) {
  const id = `settings-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div>
      <label
        htmlFor={id}
        className="text-muted-foreground mb-1 block text-xs font-medium uppercase tracking-wide"
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        defaultValue={defaultValue}
        disabled={disabled}
        min={min}
        max={max}
        onBlur={(e) => {
          if (e.target.value && e.target.value !== defaultValue) onCommit(e.target.value);
        }}
        className={fieldClass + " w-full tabular-nums"}
      />
      {helper && <p className="text-muted-foreground mt-1 text-[11px] leading-snug">{helper}</p>}
    </div>
  );
}

function UnassignedPill({
  session,
  rooms,
  pending,
  groupSeq,
  onOpen,
  onAssign,
}: {
  session: SketchpadSession;
  rooms: SketchpadRoom[];
  pending: boolean;
  groupSeq: { index: number; total: number } | null;
  onOpen: () => void;
  onAssign: (roomId: string) => void;
}) {
  return (
    <div className="border-border bg-background flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
      {groupSeq && (
        <span className="bg-surface text-foreground border-border inline-flex items-center rounded-full border px-1 py-0.5 text-[10px] font-medium tabular-nums">
          {groupSeq.index.toString()}/{groupSeq.total.toString()}
        </span>
      )}
      <button
        type="button"
        onClick={onOpen}
        className="text-foreground hover:text-primary font-medium underline-offset-2 hover:underline"
      >
        {session.class_name}
      </button>
      <span className="text-muted-foreground">— {session.trainer_name}</span>
      <select
        defaultValue=""
        disabled={pending || rooms.length === 0}
        onChange={(e) => {
          if (e.target.value) onAssign(e.target.value);
        }}
        className="bg-background border-input text-foreground ml-1 rounded border px-1 py-0.5 text-[11px]"
      >
        <option value="">Assign to…</option>
        {rooms.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function SessionDrawer({
  session,
  rooms,
  days,
  pending,
  conflictTooltip,
  groupSeq,
  siblingClassCount,
  onClose,
  onPatch,
  onDelete,
  onDuplicate,
  onRecolorClass,
}: {
  session: SketchpadSession;
  rooms: SketchpadRoom[];
  days: Date[];
  pending: boolean;
  conflictTooltip: string[];
  groupSeq: { index: number; total: number } | null;
  siblingClassCount: number;
  onClose: () => void;
  onPatch: (patch: Partial<SketchpadSession>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onRecolorClass: (color: string | null) => void;
}) {
  const currentDayIndex = days.findIndex((d) => sameDay(d, new Date(session.starts_at)));
  const autoColor = colorForClass(session.class_name);
  const effectiveColor = session.color ?? autoColor;

  function moveToDay(newIndex: number) {
    const target = days[newIndex];
    if (!target) return;
    const start = new Date(session.starts_at);
    const end = new Date(session.ends_at);
    const next = new Date(target);
    next.setHours(start.getHours(), start.getMinutes(), 0, 0);
    const durationMs = end.getTime() - start.getTime();
    onPatch({
      starts_at: next.toISOString(),
      ends_at: new Date(next.getTime() + durationMs).toISOString(),
    });
  }
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="border-border bg-background flex w-full max-w-md flex-col border-l shadow-xl"
        onClick={(e) => {
          e.stopPropagation();
        }}
        role="dialog"
        aria-modal="true"
      >
        <div className="border-border flex items-start justify-between border-b px-6 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-foreground truncate text-base font-semibold">
                {session.class_name}
              </h2>
              {groupSeq && (
                <span
                  className="bg-surface text-foreground border-border inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium tabular-nums"
                  title={`Session ${groupSeq.index.toString()} of ${groupSeq.total.toString()} in this series`}
                >
                  {groupSeq.index.toString()}/{groupSeq.total.toString()}
                </span>
              )}
            </div>
            <p className="text-muted-foreground mt-0.5 text-xs tabular-nums">
              {formatTime(session.starts_at)} – {formatTime(session.ends_at)}
            </p>
            {conflictTooltip.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {conflictTooltip.map((msg, i) => (
                  <li key={i} className="text-xs text-rose-600 dark:text-rose-400">
                    ⚠ {msg}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onDuplicate}
              disabled={pending}
              aria-label="Duplicate this session"
              title="Duplicate (same time, next day)"
              className="text-muted-foreground hover:bg-surface hover:text-foreground inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium disabled:opacity-50"
            >
              <DocumentDuplicateIcon className="h-4 w-4" />
              Duplicate
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-muted-foreground hover:text-foreground"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
          <DrawerField
            label="Trainer"
            defaultValue={session.trainer_name}
            disabled={pending}
            onCommit={(v) => {
              if (v && v !== session.trainer_name) onPatch({ trainer_name: v });
            }}
          />
          <DrawerField
            label="Class"
            defaultValue={session.class_name}
            disabled={pending}
            onCommit={(v) => {
              if (v && v !== session.class_name) onPatch({ class_name: v });
            }}
          />
          <div>
            <label className="text-muted-foreground mb-1 block text-xs font-medium uppercase tracking-wide">
              Day
            </label>
            <select
              value={currentDayIndex >= 0 ? currentDayIndex.toString() : ""}
              disabled={pending || days.length === 0}
              onChange={(e) => {
                moveToDay(Number(e.target.value));
              }}
              className={fieldClass + " w-full"}
            >
              {currentDayIndex < 0 && <option value="">(off-schedule)</option>}
              {days.map((d, i) => (
                <option key={i} value={i.toString()}>
                  {formatDayLabel(d)}
                </option>
              ))}
            </select>
            <p className="text-muted-foreground mt-1 text-[11px] leading-snug">
              Snaps the session to that day at its current time of day.
            </p>
          </div>
          <div>
            <label className="text-muted-foreground mb-1 block text-xs font-medium uppercase tracking-wide">
              Room
            </label>
            <select
              value={session.room_id ?? ""}
              disabled={pending}
              onChange={(e) => {
                onPatch({ room_id: e.target.value || null });
              }}
              className={fieldClass + " w-full"}
            >
              <option value="">— Unassigned —</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-muted-foreground mb-1 block text-xs font-medium uppercase tracking-wide">
              Color
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  onPatch({ color: null });
                }}
                disabled={pending}
                aria-label="Reset to auto color"
                title="Auto (derived from class name)"
                className={`border-border bg-surface text-muted-foreground h-7 rounded-md border px-2 text-[11px] font-medium ${
                  session.color == null ? "ring-ring ring-2" : ""
                }`}
              >
                Auto
              </button>
              {CLASS_PALETTE.map((c) => {
                const active = session.color === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      onPatch({ color: c });
                    }}
                    disabled={pending}
                    aria-label={`Set color ${c}`}
                    title={c}
                    className={`border-border h-7 w-7 rounded-md border ${
                      active ? "ring-ring ring-2" : ""
                    }`}
                    style={{ backgroundColor: c }}
                  />
                );
              })}
            </div>
            {siblingClassCount > 1 && (
              <button
                type="button"
                onClick={() => {
                  onRecolorClass(session.color);
                }}
                disabled={pending}
                className="text-muted-foreground hover:text-foreground mt-1.5 text-[11px] underline-offset-2 hover:underline disabled:opacity-50"
                title={`Apply this color to all ${siblingClassCount.toString()} "${session.class_name}" sessions in this schedule`}
              >
                Apply to all {siblingClassCount.toString()} &quot;{session.class_name}&quot;
                sessions
              </button>
            )}
            <p className="text-muted-foreground mt-1 text-[11px] leading-snug">
              Current:{" "}
              <span
                className="border-border inline-block h-3 w-3 rounded border align-middle"
                style={{ backgroundColor: effectiveColor }}
              />{" "}
              {session.color == null ? "auto" : "custom"}
            </p>
          </div>
          <DrawerField
            label="Learner count"
            type="number"
            defaultValue={session.learner_count?.toString() ?? ""}
            disabled={pending}
            onCommit={(v) => {
              const n = v === "" ? null : Number(v);
              if (n !== session.learner_count) onPatch({ learner_count: n });
            }}
          />
          <div>
            <label className="text-muted-foreground mb-1 block text-xs font-medium uppercase tracking-wide">
              Notes
            </label>
            <textarea
              defaultValue={session.notes ?? ""}
              disabled={pending}
              rows={3}
              onBlur={(e) => {
                if (e.target.value !== (session.notes ?? "")) onPatch({ notes: e.target.value });
              }}
              className={fieldClass + " w-full"}
            />
          </div>

          <button
            type="button"
            onClick={onDelete}
            disabled={pending}
            className="text-destructive text-xs hover:underline disabled:opacity-50"
          >
            Delete session
          </button>
        </div>
      </div>
    </div>
  );
}

function DrawerField({
  label,
  type = "text",
  defaultValue,
  disabled,
  onCommit,
}: {
  label: string;
  type?: "text" | "number";
  defaultValue: string;
  disabled: boolean;
  onCommit: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-muted-foreground mb-1 block text-xs font-medium uppercase tracking-wide">
        {label}
      </label>
      <input
        type={type}
        defaultValue={defaultValue}
        disabled={disabled}
        onBlur={(e) => {
          onCommit(e.target.value);
        }}
        className={fieldClass + " w-full"}
      />
    </div>
  );
}

function PasteModal({
  dayLabel,
  rooms,
  pending,
  onClose,
  onSubmit,
}: {
  dayLabel: string;
  rooms: { id: string; name: string }[];
  pending: boolean;
  onClose: () => void;
  onSubmit: (text: string) => { inserted: number; errors: string[] } | null;
}) {
  const [text, setText] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const roomList = rooms
    .map((r) => r.name)
    .slice(0, 3)
    .join(", ");

  function handleImport() {
    const result = onSubmit(text);
    if (result) setWarnings(result.errors);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="border-border bg-background flex max-h-[90vh] w-full max-w-2xl flex-col gap-3 rounded-lg border p-5 shadow-xl"
        onClick={(e) => {
          e.stopPropagation();
        }}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-foreground text-base font-semibold">Paste from spreadsheet</h2>
            <p className="text-muted-foreground mt-0.5 text-xs">
              One session per line, tab or comma separated. Imports to <strong>{dayLabel}</strong>.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted-foreground hover:text-foreground"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="text-muted-foreground bg-surface rounded-md px-3 py-2 text-[11px] leading-relaxed">
          <p className="text-foreground mb-1 font-semibold">Format</p>
          <code className="text-foreground block">
            Trainer, Class, Start (HH:MM), Duration (60m or 1h), Room (optional)
          </code>
          <p className="mt-1.5">Examples:</p>
          <pre className="text-foreground mt-0.5 overflow-x-auto whitespace-pre text-[11px]">
            {`Smith, EMR Provider, 9:00, 2h, ${rooms[0]?.name ?? "Room A"}
Park, Op Reports, 9:30 AM, 90min, ${rooms[1]?.name ?? rooms[0]?.name ?? "Room B"}
Lee, Sim Lab, 13:00, 60`}
          </pre>
          {rooms.length > 0 && (
            <p className="mt-1.5">
              Known rooms: <em>{roomList}</em>
              {rooms.length > 3 && ` (+${(rooms.length - 3).toString()} more)`}. Unknown room names
              import as Unassigned.
            </p>
          )}
        </div>

        <textarea
          autoFocus
          value={text}
          onChange={(e) => {
            setText(e.target.value);
          }}
          rows={10}
          placeholder={`Smith, EMR Provider, 9:00, 2h, ${rooms[0]?.name ?? "Room A"}`}
          className={fieldClass + " w-full font-mono text-xs"}
        />

        {warnings.length > 0 && (
          <ul className="space-y-0.5 rounded-md bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:bg-amber-900/30 dark:text-amber-100">
            {warnings.slice(0, 6).map((w, i) => (
              <li key={i}>⚠ {w}</li>
            ))}
            {warnings.length > 6 && (
              <li className="opacity-70">…{(warnings.length - 6).toString()} more</li>
            )}
          </ul>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="text-muted-foreground hover:text-foreground rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={pending || !text.trim()}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            Import
          </button>
        </div>
      </div>
    </div>
  );
}

function AutoScheduleModal({
  rooms,
  trainerHistory,
  pending,
  onClose,
  onSubmit,
}: {
  rooms: SketchpadRoom[];
  trainerHistory: string[];
  pending: boolean;
  onClose: () => void;
  onSubmit: (req: {
    className: string;
    trainerName: string | null;
    durationMinutes: number;
    count: number;
    learnerCount: number | null;
    preferredRoomId: string | null;
    preferredStartMinutes: number | null;
    distribution: "one-per-day" | "fill-earliest";
  }) => void;
}) {
  const [className, setClassName] = useState("");
  const [trainerName, setTrainerName] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [count, setCount] = useState("5");
  const [learnerCount, setLearnerCount] = useState("");
  const [preferredRoomId, setPreferredRoomId] = useState("");
  const [startTime, setStartTime] = useState("");
  const [distribution, setDistribution] = useState<"one-per-day" | "fill-earliest">("one-per-day");

  function handleSubmit() {
    const klass = className.trim();
    if (!klass) {
      toast.error("Class name is required");
      return;
    }
    const dur = Number(durationMinutes);
    if (!Number.isFinite(dur) || dur <= 0) {
      toast.error("Duration must be a positive number of minutes");
      return;
    }
    const n = Number(count);
    if (!Number.isFinite(n) || n < 1) {
      toast.error("Session count must be at least 1");
      return;
    }
    let preferredStartMinutes: number | null = null;
    if (startTime) {
      const [hh, mm] = startTime.split(":").map(Number);
      if (Number.isFinite(hh) && Number.isFinite(mm)) {
        preferredStartMinutes = (hh ?? 0) * 60 + (mm ?? 0);
      }
    }
    onSubmit({
      className: klass,
      trainerName: trainerName.trim() || null,
      durationMinutes: Math.round(dur),
      count: Math.round(n),
      learnerCount: learnerCount.trim() === "" ? null : Number(learnerCount),
      preferredRoomId: preferredRoomId || null,
      preferredStartMinutes,
      distribution,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="border-border bg-background flex max-h-[90vh] w-full max-w-xl flex-col gap-3 overflow-y-auto rounded-lg border p-5 shadow-xl"
        onClick={(e) => {
          e.stopPropagation();
        }}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-foreground inline-flex items-center gap-1.5 text-base font-semibold">
              <SparklesIcon className="h-4 w-4" />
              Auto-schedule sessions
            </h2>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Place N identical classes across this sketch&apos;s day window. Avoids trainer and
              room conflicts with what&apos;s already on the calendar.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted-foreground hover:text-foreground"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="text-muted-foreground mb-0.5 block text-[10px] font-medium uppercase tracking-wide">
              Class name
            </label>
            <input
              autoFocus
              value={className}
              onChange={(e) => {
                setClassName(e.target.value);
              }}
              placeholder="e.g., EMR Provider"
              className={fieldClass + " w-full"}
              disabled={pending}
            />
          </div>
          <div>
            <label className="text-muted-foreground mb-0.5 block text-[10px] font-medium uppercase tracking-wide">
              Trainer (optional)
            </label>
            <input
              value={trainerName}
              onChange={(e) => {
                setTrainerName(e.target.value);
              }}
              list="auto-trainer-history"
              placeholder="Auto-pick least-loaded"
              className={fieldClass + " w-full"}
              disabled={pending}
            />
            <datalist id="auto-trainer-history">
              {trainerHistory.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            <p className="text-muted-foreground mt-1 text-[11px] leading-snug">
              Leave blank to auto-pick the least-loaded trainer in this schedule.
            </p>
          </div>
          <div>
            <label className="text-muted-foreground mb-0.5 block text-[10px] font-medium uppercase tracking-wide">
              Preferred room (optional)
            </label>
            <select
              value={preferredRoomId}
              onChange={(e) => {
                setPreferredRoomId(e.target.value);
              }}
              className={fieldClass + " w-full"}
              disabled={pending || rooms.length === 0}
            >
              <option value="">Auto best-fit</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.capacity != null ? ` (cap ${r.capacity.toString()})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-muted-foreground mb-0.5 block text-[10px] font-medium uppercase tracking-wide">
              Duration (min)
            </label>
            <input
              type="number"
              min={5}
              step={5}
              value={durationMinutes}
              onChange={(e) => {
                setDurationMinutes(e.target.value);
              }}
              className={fieldClass + " w-full tabular-nums"}
              disabled={pending}
            />
          </div>
          <div>
            <label className="text-muted-foreground mb-0.5 block text-[10px] font-medium uppercase tracking-wide">
              Sessions to schedule
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={count}
              onChange={(e) => {
                setCount(e.target.value);
              }}
              className={fieldClass + " w-full tabular-nums"}
              disabled={pending}
            />
          </div>
          <div>
            <label className="text-muted-foreground mb-0.5 block text-[10px] font-medium uppercase tracking-wide">
              Learners per session (optional)
            </label>
            <input
              type="number"
              min={0}
              value={learnerCount}
              onChange={(e) => {
                setLearnerCount(e.target.value);
              }}
              placeholder="Best-fit picks smallest room that holds this"
              className={fieldClass + " w-full tabular-nums"}
              disabled={pending}
            />
          </div>
          <div>
            <label className="text-muted-foreground mb-0.5 block text-[10px] font-medium uppercase tracking-wide">
              Earliest start time (optional)
            </label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => {
                setStartTime(e.target.value);
              }}
              className={fieldClass + " w-full tabular-nums"}
              disabled={pending}
            />
            <p className="text-muted-foreground mt-1 text-[11px] leading-snug">
              Each daily search begins at this time. Leave blank to start at the day window&apos;s
              opening hour.
            </p>
          </div>
          <div className="md:col-span-2">
            <label className="text-muted-foreground mb-1 block text-[10px] font-medium uppercase tracking-wide">
              Distribution
            </label>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { value: "one-per-day", label: "Spread (1 per day, then stack)" },
                  { value: "fill-earliest", label: "Fill earliest day first" },
                ] as const
              ).map((opt) => {
                const active = distribution === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setDistribution(opt.value);
                    }}
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground hover:bg-surface"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="text-muted-foreground hover:text-foreground rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={pending || !className.trim()}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            <SparklesIcon className="h-4 w-4" />
            Schedule
          </button>
        </div>
      </div>
    </div>
  );
}

function HelpOverlay({ onClose }: { onClose: () => void }) {
  const shortcuts: Array<[string, string]> = [
    ["N", "Focus the quick-add Trainer field"],
    ["Enter (in Class field)", "Commit the quick-add row"],
    ["Esc", "Close drawer / modal / menu / overlay"],
    ["?", "Toggle this help overlay"],
    ["Drag a session block", "Move in time, across rooms, or resize via the bottom edge"],
    ["Click a session", "Open the side drawer to edit / delete"],
  ];
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="border-border bg-background w-full max-w-md rounded-lg border p-5 shadow-xl"
        onClick={(e) => {
          e.stopPropagation();
        }}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-3 flex items-start justify-between">
          <h2 className="text-foreground text-base font-semibold">Keyboard shortcuts</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted-foreground hover:text-foreground"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
        <ul className="divide-border divide-y text-xs">
          {shortcuts.map(([key, label]) => (
            <li key={key} className="flex items-center justify-between py-2">
              <span className="text-foreground">{label}</span>
              <kbd className="border-border bg-surface text-foreground rounded border px-2 py-0.5 font-mono text-[11px]">
                {key}
              </kbd>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
