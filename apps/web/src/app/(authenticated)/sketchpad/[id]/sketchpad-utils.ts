import { addDays } from "date-fns";

/**
 * Pure helpers extracted from sketchpad-editor.tsx.
 *
 * These carry the sketchpad's trickiest logic — local-time date arithmetic and
 * the smart-paste parser — but had no React dependency and no way to test them
 * while they sat inside a 2,500-line client component.
 */

/** Also rendered directly as the per-session colour picker. */
export const CLASS_PALETTE = [
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

export function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Stable per-class colour so the same class keeps its colour across renders. */
export function colorForClass(name: string): string {
  const key = name.trim().toLowerCase();
  if (!key) return CLASS_PALETTE[0];
  const idx = hashString(key) % CLASS_PALETTE.length;
  return CLASS_PALETTE[idx] ?? CLASS_PALETTE[0];
}

// Date+time helpers — sketchpad runs entirely in browser-local time. We
// store as UTC ISO via Date.toISOString() and render via Date#toLocaleString.
export function dayDate(scheduleStart: string, dayIndex: number): Date {
  // scheduleStart is "YYYY-MM-DD" — interpret as midnight local.
  const [y, m, d] = scheduleStart.split("-").map(Number);
  return addDays(new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1), dayIndex);
}

export function ymd(d: Date): string {
  const y = d.getFullYear().toString();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function daysBetweenInclusive(startYmd: string, endYmd: string): number {
  // Returns the day_count corresponding to [start..end] inclusive (so a
  // single-day schedule = 1). Negative or invalid spans return 0.
  const [sy, sm, sd] = startYmd.split("-").map(Number);
  const [ey, em, ed] = endYmd.split("-").map(Number);
  const start = new Date(sy ?? 2026, (sm ?? 1) - 1, sd ?? 1);
  const end = new Date(ey ?? 2026, (em ?? 1) - 1, ed ?? 1);
  const diff = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  return diff < 0 ? 0 : diff + 1;
}

export function formatDayLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function isoFor(day: Date, hour: number, minute: number): string {
  const d = new Date(day);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

export function isoForOffset(startIso: string, durationMinutes: number): string {
  const end = new Date(startIso);
  end.setMinutes(end.getMinutes() + durationMinutes);
  return end.toISOString();
}

/** Two intervals [a1,a2) and [b1,b2) overlap iff a1 < b2 && b1 < a2. */
export function intervalsOverlap(a1: Date, a2: Date, b1: Date, b2: Date): boolean {
  return a1 < b2 && b1 < a2;
}

export function sameDay(a: Date, b: Date): boolean {
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

export type ParsedRow = {
  trainer_name: string;
  class_name: string;
  starts_at: string; // ISO
  ends_at: string; // ISO
  room_id: string | null;
};

export function parsePasteText(
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

export function parseTimeToMinutes(raw: string): number | null {
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

export function parseDurationToMinutes(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  // bare number → minutes
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s));
  const minMatch = /^(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)$/.exec(s);
  if (minMatch?.[1]) return Math.round(Number(minMatch[1]));
  const hMatch = /^(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)$/.exec(s);
  if (hMatch?.[1]) return Math.round(Number(hMatch[1]) * 60);
  return null;
}
