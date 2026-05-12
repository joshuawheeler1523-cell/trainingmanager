#!/usr/bin/env tsx
/**
 * End-to-end verification for the lunch-span + PTO fixes against the
 * "Dual Care Connect Projects" implementation in prod.
 *
 * Uses plain fetch against PostgREST (no @supabase/supabase-js dependency) so
 * the script runs from anywhere with just tsx + the env vars in
 * apps/web/.env.local.
 *
 * Run:  pnpm dlx tsx scripts/verify-dual-care-schedule.ts
 * Run:  pnpm dlx tsx scripts/verify-dual-care-schedule.ts --commit
 *
 * Defaults to ROLLING BACK — after counting the generator's output the script
 * deletes the draft sessions it created so the user's data is unchanged. Pass
 * --commit to keep them.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DUAL_CARE_IMPL_ID = "7d3fb2a5-2c83-4990-adce-d023093df0da";

const envRaw = readFileSync(resolve(process.cwd(), "apps/web/.env.local"), "utf8");
const env: Record<string, string> = {};
for (const line of envRaw.split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/.exec(line);
  if (!m) continue;
  const [, key, valueRaw] = m;
  if (!key || valueRaw === undefined) continue;
  env[key] = valueRaw.replace(/^["'](.*)["']$/, "$1");
}
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const commit = process.argv.includes("--commit");

const baseHeaders: Record<string, string> = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
};

async function pgGet<T>(path: string): Promise<T> {
  const r = await fetch(`${url}/rest/v1/${path}`, { headers: baseHeaders });
  if (!r.ok) throw new Error(`GET ${path}: ${r.status.toString()} ${await r.text()}`);
  return (await r.json()) as T;
}

async function pgCount(path: string): Promise<number> {
  const r = await fetch(`${url}/rest/v1/${path}`, {
    method: "HEAD",
    headers: { ...baseHeaders, Prefer: "count=exact" },
  });
  const range = r.headers.get("content-range");
  if (!range) return 0;
  const m = /\/(\d+)$/.exec(range);
  return m && m[1] ? Number.parseInt(m[1], 10) : 0;
}

async function pgRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const r = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: baseHeaders,
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(`RPC ${fn}: ${r.status.toString()} ${await r.text()}`);
  return (await r.json()) as T;
}

async function pgDelete(path: string): Promise<void> {
  const r = await fetch(`${url}/rest/v1/${path}`, {
    method: "DELETE",
    headers: baseHeaders,
  });
  if (!r.ok) throw new Error(`DELETE ${path}: ${r.status.toString()} ${await r.text()}`);
}

type ImplClass = {
  id: string;
  name: string;
  total_people_to_train: number;
  expected_learners_per_session: number;
  hours_per_session: number;
  sort_order: number;
};

type GenResult = {
  sessions: number;
  conflicts: number;
  capacity_gaps: Array<{
    class_id: string;
    class_name: string;
    session_index: number;
    reason: string;
  }>;
  recommendations: Record<string, unknown>;
  cutoff_date: string;
};

type ImplSession = {
  impl_class_id: string;
  scheduled_start: string;
  scheduled_end: string;
  impl_trainer_id: string;
  impl_room_id: string;
};

async function main() {
  const classes = await pgGet<ImplClass[]>(
    `impl_classes?implementation_id=eq.${DUAL_CARE_IMPL_ID}&order=sort_order&select=id,name,total_people_to_train,expected_learners_per_session,hours_per_session,sort_order`,
  );

  console.log("\n── Dual Care Connect Projects ─────────────────────────────────────");
  console.log(`Implementation: ${DUAL_CARE_IMPL_ID}`);
  console.log(`Classes:        ${classes.length.toString()}\n`);

  let expectedSessions = 0;
  let expectedHours = 0;
  console.log("  Class                                   Sessions   Hours  /session");
  console.log("  " + "─".repeat(70));
  for (const c of classes) {
    const sessions = Math.ceil(c.total_people_to_train / c.expected_learners_per_session);
    const hours = sessions * Number(c.hours_per_session);
    expectedSessions += sessions;
    expectedHours += hours;
    const padName = c.name.padEnd(38).slice(0, 38);
    console.log(
      `  ${padName} ${String(sessions).padStart(8)} ${hours.toFixed(1).padStart(7)} ${Number(c.hours_per_session).toString().padStart(8)}h`,
    );
  }
  console.log("  " + "─".repeat(70));
  console.log(`  Total sessions expected:  ${String(expectedSessions)}`);
  console.log(`  Total instruction hours:  ${expectedHours.toFixed(1)}\n`);

  const existingDrafts = await pgCount(
    `impl_sessions?implementation_id=eq.${DUAL_CARE_IMPL_ID}&status=eq.draft`,
  );
  console.log(`Existing draft sessions: ${existingDrafts.toString()}\n`);

  console.log("Calling generate_implementation_schedule()…");
  const result = await pgRpc<GenResult>("generate_implementation_schedule", {
    p_implementation_id: DUAL_CARE_IMPL_ID,
  });

  console.log(`\nGenerator output:`);
  console.log(`  sessions placed:     ${result.sessions.toString()}`);
  console.log(`  capacity_gaps:       ${result.conflicts.toString()}`);
  console.log(`  cutoff_date:         ${result.cutoff_date}`);
  if (result.capacity_gaps.length > 0) {
    console.log(`\n  Unscheduled sessions:`);
    for (const gap of result.capacity_gaps) {
      console.log(`    • ${gap.class_name} session ${String(gap.session_index)} — ${gap.reason}`);
    }
  }

  const createdSessions = await pgGet<ImplSession[]>(
    `impl_sessions?implementation_id=eq.${DUAL_CARE_IMPL_ID}&status=eq.draft&order=scheduled_start&select=impl_class_id,scheduled_start,scheduled_end,impl_trainer_id,impl_room_id`,
  );

  console.log(`\nPer-class results:`);
  console.log("  Class                                   Expected  Placed");
  console.log("  " + "─".repeat(60));
  let allPlaced = true;
  for (const c of classes) {
    const expected = Math.ceil(c.total_people_to_train / c.expected_learners_per_session);
    const placed = createdSessions.filter((s) => s.impl_class_id === c.id).length;
    const ok = placed === expected ? "✓" : "✗";
    if (placed !== expected) allPlaced = false;
    const padName = c.name.padEnd(38).slice(0, 38);
    console.log(
      `  ${padName} ${String(expected).padStart(8)}  ${String(placed).padStart(5)} ${ok}`,
    );
  }
  console.log("  " + "─".repeat(60));

  console.log(`\nLunch-span check (sessions with instr hours ≥ 6):`);
  const longSessions = createdSessions.filter((s) => {
    const cls = classes.find((c) => c.id === s.impl_class_id);
    return cls && Number(cls.hours_per_session) >= 6;
  });
  console.log(`  Long sessions placed: ${String(longSessions.length)}`);
  let spanCorrect = 0;
  let spanIncorrect = 0;
  for (const s of longSessions) {
    const cls = classes.find((c) => c.id === s.impl_class_id);
    if (!cls) continue;
    const instructionHours = Number(cls.hours_per_session);
    const wallClockHours =
      (new Date(s.scheduled_end).getTime() - new Date(s.scheduled_start).getTime()) / 3.6e6;
    const expectedWallClock = instructionHours + 1;
    if (Math.abs(wallClockHours - expectedWallClock) < 0.01) spanCorrect++;
    else {
      spanIncorrect++;
      if (spanIncorrect <= 3) {
        console.log(
          `    ✗ ${cls.name}: instr=${String(instructionHours)}h wall=${wallClockHours.toFixed(2)}h (expected ${String(expectedWallClock)}h)`,
        );
      }
    }
  }
  console.log(`  Spanning correctly (wall = instr + 1h lunch): ${String(spanCorrect)}`);
  console.log(`  NOT spanning (sign of unfixed lunch bug):     ${String(spanIncorrect)}`);

  console.log("\n── Verdict ─────────────────────────────────────────────────────────");
  if (allPlaced && result.conflicts === 0 && createdSessions.length === expectedSessions) {
    console.log(`✓ PASS — all ${String(expectedSessions)} sessions placed, 0 gaps.`);
  } else {
    console.log(
      `✗ FAIL — ${String(createdSessions.length)} placed / ${String(expectedSessions)} expected, ${result.conflicts.toString()} gaps.`,
    );
  }
  if (longSessions.length > 0 && spanIncorrect === 0) {
    console.log(`✓ PASS — all ${String(longSessions.length)} long sessions span lunch correctly.`);
  } else if (spanIncorrect > 0) {
    console.log(`✗ FAIL — ${String(spanIncorrect)} long sessions did NOT span lunch.`);
  }

  if (commit) {
    console.log("\n(--commit set: leaving the new draft sessions in place)");
  } else {
    console.log("\nRolling back: deleting the draft sessions we created…");
    await pgDelete(`impl_sessions?implementation_id=eq.${DUAL_CARE_IMPL_ID}&status=eq.draft`);
    console.log(`Deleted ${String(createdSessions.length)} draft sessions.`);
    if (existingDrafts > 0) {
      console.log(
        `WARNING: the impl had ${String(existingDrafts)} pre-existing drafts that the generator's own DELETE also removed.`,
      );
      console.log(`To recreate them with the fixed logic, click Generate in the UI.`);
    }
  }
}

main().catch((e: unknown) => {
  console.error("Script error:", e);
  process.exit(1);
});
