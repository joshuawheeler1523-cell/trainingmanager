#!/usr/bin/env tsx
/* eslint-disable @typescript-eslint/no-non-null-assertion, @typescript-eslint/restrict-template-expressions -- one-off diagnostic script; postgres rows from raw fetches don't have rich types, and console.log builds short interpolations where the strict template-expression rule isn't pulling its weight. */
/**
 * Deeper diagnostic for DCH Care Connect. Calls runSchedule and dumps
 * placements by room × day so we can see exactly what the solver did
 * and what time gaps it left empty.
 *
 * Run from apps/web:
 *   pnpm dlx tsx --require ./scripts/stub-server-only.cjs scripts/probe-dch-placements.ts
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  solve,
  type SolverInput,
  type BusyInterval,
} from "../src/lib/training-planner/schedule-solver";
import type { ImplClassPrerequisite } from "@arbor/shared";
import type { Database } from "../src/lib/supabase/database.types";

const DCH_IMPL_ID = "6d8c55e6-ab18-44d5-aa87-bb3f44281518";
const ORG_ID = "d6aa953c-e76d-4ef4-892d-3fa2869dde13";

function loadEnv(): { url: string; serviceKey: string } {
  const envRaw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  const env: Record<string, string> = {};
  for (const line of envRaw.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/.exec(line);
    if (!m) continue;
    const [, key, valueRaw] = m;
    if (!key || valueRaw === undefined) continue;
    env[key] = valueRaw.replace(/^["'](.*)["']$/, "$1");
  }
  return { url: env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey: env.SUPABASE_SERVICE_ROLE_KEY! };
}

function parseUtcDate(s: string): Date {
  return new Date(s + "T00:00:00Z");
}
function fmtUtcDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function main() {
  const { url, serviceKey } = loadEnv();
  const supabase = createClient<Database>(url, serviceKey, { auth: { persistSession: false } });

  // Load impl + everything it needs
  const { data: impl } = await supabase
    .from("implementations")
    .select("*, organizations!inner(time_zone)")
    .eq("id", DCH_IMPL_ID)
    .maybeSingle();
  if (!impl) throw new Error("impl not found");
  const orgTz =
    (impl.organizations as unknown as { time_zone: string | null } | null)?.time_zone ??
    "America/New_York";

  const cutoff = (() => {
    if (!impl.go_live_date) return impl.window_end_date!;
    const goLive = parseUtcDate(impl.go_live_date);
    goLive.setUTCDate(goLive.getUTCDate() - impl.go_live_buffer_days);
    const earlier =
      goLive < parseUtcDate(impl.window_end_date!) ? goLive : parseUtcDate(impl.window_end_date!);
    return fmtUtcDate(earlier);
  })();

  const [
    { data: rooms },
    { data: trainers },
    { data: classes },
    { data: ct },
    { data: prereqs },
    { data: pto },
  ] = await Promise.all([
    supabase
      .from("impl_rooms")
      .select("*")
      .eq("implementation_id", DCH_IMPL_ID)
      .order("sort_order"),
    supabase
      .from("impl_trainers")
      .select("*")
      .eq("implementation_id", DCH_IMPL_ID)
      .order("sort_order"),
    supabase
      .from("impl_classes")
      .select("*")
      .eq("implementation_id", DCH_IMPL_ID)
      .order("sort_order"),
    supabase
      .from("impl_class_trainers")
      .select("impl_class_id, impl_trainer_id")
      .eq("org_id", ORG_ID),
    supabase.from("impl_class_prerequisites").select("*").eq("org_id", ORG_ID),
    supabase
      .from("impl_trainer_unavailability")
      .select("impl_trainer_id, starts_at, ends_at")
      .eq("org_id", ORG_ID),
  ]);

  const ourTrainerIds = new Set((trainers ?? []).map((t) => t.id));
  const busyTrainers: BusyInterval[] = [];
  for (const u of pto ?? []) {
    if (!ourTrainerIds.has(u.impl_trainer_id)) continue;
    busyTrainers.push({ resourceId: u.impl_trainer_id, start: u.starts_at, end: u.ends_at });
  }

  const input: SolverInput = {
    windowStartDate: impl.window_start_date!,
    windowEndDate: impl.window_end_date!,
    cutoffDate: cutoff,
    orgTimeZone: orgTz,
    lunchBreakStartMinutes: impl.lunch_break_start_minutes,
    lunchBreakLengthMinutes: impl.lunch_break_length_minutes,
    businessHoursStartLocal: impl.business_hours_start_local,
    businessHoursEndLocal: impl.business_hours_end_local,
    rooms: rooms ?? [],
    trainers: trainers ?? [],
    classes: classes ?? [],
    classTrainers: (ct ?? []).filter((x) => (classes ?? []).some((c) => c.id === x.impl_class_id)),
    prerequisites: ((prereqs ?? []) as ImplClassPrerequisite[]).filter((p) =>
      (classes ?? []).some((c) => c.id === p.impl_class_id),
    ),
    busyTrainers,
    busyRooms: [],
    initialTrainerWeekHours: {},
  };

  const result = solve(input, { timeBudgetMs: 3 * 60_000 });

  const roomById = new Map((rooms ?? []).map((r) => [r.id, r]));
  const classById = new Map((classes ?? []).map((c) => [c.id, c]));
  const trainerById = new Map((trainers ?? []).map((t) => [t.id, t]));

  console.log(`Placed ${result.placements.length} sessions, ${result.gaps.length} gaps.`);
  console.log(`Wall clock: ${result.durationMs}ms, timed out: ${String(result.timedOut)}\n`);

  // Group by room + day
  type Placement = (typeof result.placements)[number];
  const byRoom = new Map<string, Map<string, Placement[]>>();
  for (const p of result.placements) {
    const room = roomById.get(p.roomId)?.name ?? p.roomId;
    const day = p.start.slice(0, 10);
    if (!byRoom.has(room)) byRoom.set(room, new Map());
    const dm = byRoom.get(room)!;
    if (!dm.has(day)) dm.set(day, []);
    dm.get(day)!.push(p);
  }

  // Window day list (Mon-Fri only)
  const days: string[] = [];
  const start = parseUtcDate(input.windowStartDate);
  const end = parseUtcDate(input.windowEndDate);
  const cur = new Date(start);
  while (cur <= end) {
    const dow = cur.getUTCDay();
    if (dow >= 1 && dow <= 5) days.push(fmtUtcDate(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  console.log("ROOM UTILIZATION (each row is one room, columns are weekdays in window):\n");
  for (const [roomName, dm] of byRoom.entries()) {
    const placedDays = Array.from(dm.keys()).sort();
    const totalSessions = Array.from(dm.values()).reduce((a, b) => a + b.length, 0);
    const totalHours = Array.from(dm.values())
      .flat()
      .reduce((a, p) => {
        const ms = new Date(p.end).getTime() - new Date(p.start).getTime();
        return a + ms / 3_600_000;
      }, 0);
    console.log(
      `${roomName}: ${totalSessions} sessions / ${totalHours.toFixed(1)}h over ${placedDays.length} days`,
    );
  }

  console.log("\nEMPTY DAYS PER ROOM (= room had ZERO sessions all day):");
  for (const room of rooms ?? []) {
    const emptyDays = days.filter((d) => !byRoom.get(room.name)?.has(d));
    console.log(
      `  ${room.name} (seats=${room.seat_capacity}): ${emptyDays.length}/${days.length} weekdays empty`,
    );
  }

  console.log("\nDETAIL: rooms that are partly used:");
  for (const [roomName, dm] of byRoom.entries()) {
    if (dm.size === 0) continue;
    const sortedDays = Array.from(dm.entries()).sort(([a], [b]) => a.localeCompare(b));
    console.log(`\n  ${roomName}:`);
    for (const [day, places] of sortedDays) {
      const win = places
        .sort((a, b) => a.start.localeCompare(b.start))
        .map((p) => {
          const cls = classById.get(p.classId);
          const tr = trainerById.get(p.trainerId);
          const t1 = p.start.slice(11, 16);
          const t2 = p.end.slice(11, 16);
          return `${t1}-${t2} ${cls?.name.slice(0, 25) ?? p.classId} [${tr?.name ?? "?"}]`;
        })
        .join(" | ");
      console.log(`    ${day}: ${win}`);
    }
  }

  if (result.gaps.length > 0) {
    console.log("\nGAPS (sessions the solver couldn't place):");
    const gapByClass = new Map<string, number>();
    for (const g of result.gaps) {
      gapByClass.set(g.className, (gapByClass.get(g.className) ?? 0) + 1);
    }
    for (const [name, n] of gapByClass.entries()) {
      console.log(`  ${name}: ${n} sessions short`);
    }
  }
}

void main().catch((err: unknown) => {
  console.error("FATAL:", err);
  process.exit(1);
});
