import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import type { SketchpadRoom, SketchpadSchedule, SketchpadSession } from "@arbor/shared";

export const runtime = "nodejs";

// GET /api/sketchpad/[id]/schedule.xlsx?format=byday|bysession
//
// `byday` (default): one sheet per day with rooms as columns and rows
//   per slot — what the planner shows to learners.
// `bysession`: a single flat sheet with one row per session — easier to
//   sort, filter, and email to a director.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const format = (url.searchParams.get("format") ?? "byday").toLowerCase();

  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) return new NextResponse("Unauthorized", { status: 401 });

  const [{ data: schedule }, { data: rooms }, { data: sessions }] = await Promise.all([
    supabase
      .from("sketchpad_schedules")
      .select("*")
      .eq("id", id)
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("sketchpad_rooms")
      .select("*")
      .eq("schedule_id", id)
      .eq("org_id", orgId)
      .order("position"),
    supabase
      .from("sketchpad_sessions")
      .select("*")
      .eq("schedule_id", id)
      .eq("org_id", orgId)
      .order("starts_at"),
  ]);

  if (!schedule) return new NextResponse("Not found", { status: 404 });

  const s: SketchpadSchedule = schedule;
  const roomList = (rooms ?? []) as SketchpadRoom[];
  const sessionList = (sessions ?? []) as SketchpadSession[];
  const roomById = new Map(roomList.map((r) => [r.id, r]));

  const wb = XLSX.utils.book_new();

  if (format === "bysession") {
    const rows = sessionList.map((sess) => {
      const start = new Date(sess.starts_at);
      const end = new Date(sess.ends_at);
      const durationMin = Math.round((end.getTime() - start.getTime()) / 60000);
      return {
        Day: start.toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
        }),
        Date: start.toLocaleDateString(),
        Start: start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        End: end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        Duration: `${durationMin.toString()} min`,
        Trainer: sess.trainer_name,
        Class: sess.class_name,
        Room: sess.room_id ? (roomById.get(sess.room_id)?.name ?? "—") : "(Unassigned)",
        Learners: sess.learner_count ?? "",
        Notes: sess.notes ?? "",
      };
    });
    const sheet = XLSX.utils.json_to_sheet(rows);
    sheet["!cols"] = [
      { wch: 14 },
      { wch: 12 },
      { wch: 8 },
      { wch: 8 },
      { wch: 10 },
      { wch: 22 },
      { wch: 28 },
      { wch: 18 },
      { wch: 10 },
      { wch: 32 },
    ];
    XLSX.utils.book_append_sheet(wb, sheet, "Sessions");
  } else {
    // byday — one sheet per day, rooms as columns, time slots as rows.
    const slotMinutes = s.slot_minutes;
    const slotsPerDay = Math.max(1, Math.floor(((s.hours_end - s.hours_start) * 60) / slotMinutes));

    for (let dayIdx = 0; dayIdx < s.day_count; dayIdx++) {
      const day = dayDate(s.start_date, dayIdx);
      const sheetName = formatSheetName(day);
      const header = ["Time", ...roomList.map((r) => r.name)];

      // Index sessions by (room_id, slot_index) — slot is the slot the
      // session STARTS in.
      const byCell = new Map<string, SketchpadSession>();
      for (const sess of sessionList) {
        if (!sess.room_id) continue;
        const start = new Date(sess.starts_at);
        if (!sameDay(start, day)) continue;
        const startMin = start.getHours() * 60 + start.getMinutes();
        const slotIdx = Math.floor((startMin - s.hours_start * 60) / slotMinutes);
        if (slotIdx < 0 || slotIdx >= slotsPerDay) continue;
        byCell.set(`${sess.room_id}|${slotIdx.toString()}`, sess);
      }

      const aoa: (string | number)[][] = [header];
      for (let slotIdx = 0; slotIdx < slotsPerDay; slotIdx++) {
        const minutesFromMidnight = s.hours_start * 60 + slotIdx * slotMinutes;
        const hh = Math.floor(minutesFromMidnight / 60);
        const mm = minutesFromMidnight % 60;
        const timeLabel = `${pad2(hh)}:${pad2(mm)}`;
        const row: (string | number)[] = [timeLabel];
        for (const room of roomList) {
          const sess = byCell.get(`${room.id}|${slotIdx.toString()}`);
          row.push(sess ? `${sess.trainer_name} — ${sess.class_name}` : "");
        }
        aoa.push(row);
      }
      const sheet = XLSX.utils.aoa_to_sheet(aoa);
      sheet["!cols"] = [{ wch: 8 }, ...roomList.map(() => ({ wch: 30 }))];
      XLSX.utils.book_append_sheet(wb, sheet, sheetName);
    }

    if (s.day_count === 0 || roomList.length === 0) {
      // Edge case — produce at least one sheet so Excel doesn't choke.
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([["No data — add rooms and sessions to your sketch."]]),
        "Empty",
      );
    }
  }

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const body = new Uint8Array(buf);
  const filename = `${s.name
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()}-sketch.xlsx`;
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function pad2(n: number): string {
  return n < 10 ? `0${n.toString()}` : n.toString();
}

function dayDate(scheduleStart: string, dayIndex: number): Date {
  const [y, m, d] = scheduleStart.split("-").map(Number);
  const base = new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1);
  base.setDate(base.getDate() + dayIndex);
  return base;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatSheetName(d: Date): string {
  // Excel sheet name max 31 chars; no [ ] : * ? / \ chars.
  return d
    .toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
    .replace(/[[\]:*?/\\]/g, "-")
    .slice(0, 31);
}
