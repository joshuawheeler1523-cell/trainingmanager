#!/usr/bin/env tsx
/**
 * One-off diagnostic for the CSP solver. Loads DCH Care Connect from prod
 * via the service-role key, runs runSchedule() in dry-run mode anchored
 * to LCMH Care Connect with a 5-minute time budget instead of the
 * default 5 seconds, and dumps placements / gaps / diagnoses.
 *
 * Goal: distinguish algorithm weakness (search timed out before finding
 * the feasible plan) from a model bug (a constraint is over-blocking
 * slots that the user can fit manually).
 *
 * Run from the apps/web directory:
 *   pnpm tsx scripts/diagnose-csp-budget.ts
 * or from repo root:
 *   pnpm --filter web exec node --import tsx scripts/diagnose-csp-budget.ts
 *
 * Reads SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL from
 * apps/web/.env.local. Does NOT write — pure dry-run.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { runSchedule } from "../src/lib/training-planner/schedule-runner";
import type { Database } from "../src/lib/supabase/database.types";

const DCH_IMPL_ID = "6d8c55e6-ab18-44d5-aa87-bb3f44281518";
const LCMH_IMPL_ID = "7d3fb2a5-2c83-4990-adce-d023093df0da";
const ORG_ID = "d6aa953c-e76d-4ef4-892d-3fa2869dde13";
const DEPT_ID = "40f2a06b-07dd-470a-9819-f8e890f1a26c";

// 3 minutes — should be enough to either find a feasible plan or
// exhaustively prove there isn't one for this input size.
const LONG_BUDGET_MS = 3 * 60 * 1000;

function loadEnv(): { url: string; serviceKey: string } {
  const envPath = resolve(process.cwd(), ".env.local");
  const envRaw = readFileSync(envPath, "utf8");
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
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return { url, serviceKey };
}

async function main() {
  const { url, serviceKey } = loadEnv();
  const supabase = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false },
  });

  console.log("=".repeat(70));
  console.log("CSP SOLVER DIAGNOSTIC — DCH Care Connect");
  console.log("=".repeat(70));

  type Run = { label: string; anchors: string[]; budgetMs: number };
  const runs: Run[] = [
    { label: "NO ANCHOR · 5s budget (production default)", anchors: [], budgetMs: 5_000 },
    { label: "NO ANCHOR · 3min budget", anchors: [], budgetMs: LONG_BUDGET_MS },
    {
      label: "ANCHORED to LCMH · 5s budget (production default)",
      anchors: [LCMH_IMPL_ID],
      budgetMs: 5_000,
    },
    {
      label: "ANCHORED to LCMH · 3min budget",
      anchors: [LCMH_IMPL_ID],
      budgetMs: LONG_BUDGET_MS,
    },
  ];

  for (const r of runs) {
    console.log("\n" + "-".repeat(70));
    console.log(r.label);
    console.log("-".repeat(70));

    const started = Date.now();
    const result = await runSchedule(supabase, ORG_ID, DEPT_ID, DCH_IMPL_ID, r.anchors, {
      dryRun: true,
      solverOptions: { timeBudgetMs: r.budgetMs },
    });
    const elapsed = Date.now() - started;

    if (!result.ok) {
      console.log(`  ERROR: ${result.error.code} — ${result.error.message}`);
      continue;
    }
    const d = result.data;
    console.log(`  Wall clock: ${elapsed.toString()}ms`);
    console.log(
      `  Placed:     ${d.sessions.toString()} sessions  ·  Gaps: ${d.conflicts.toString()}`,
    );
    if (d.aborted) console.log(`  ABORTED (anchor mode atomic abort — drafts preserved)`);

    if (d.diagnoses.length > 0) {
      console.log(`  Per-class bottlenecks:`);
      for (const diag of d.diagnoses) {
        console.log(
          `    · ${diag.className} — ${diag.unplacedSessions.toString()} short  [${diag.bottleneck}]`,
        );
      }
    }
    if (d.headline_fix) {
      console.log(`  Biggest unlock: ${d.headline_fix.recommendedFix}`);
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log("INTERPRETATION");
  console.log("=".repeat(70));
  console.log(`
  • If the 3min runs place SIGNIFICANTLY MORE than the 5s runs:
    ALGORITHM WEAKNESS — the solver was timing out. CP-SAT / OR-Tools
    or a JS hardening pass (MRV + forward checking) would fix this.

  • If the 3min runs place the SAME or just a tiny bit more:
    MODEL BUG — a constraint is wrongly blocking slots. The engine
    has explored exhaustively and concluded infeasibility. Audit:
    anchor busy intervals, cross-impl shared-instructor matching,
    PTO clipping, business-hours/lunch math, prereq earliest-start.

  • If anchored 3min ≈ non-anchored 3min: anchor mode is fine and
    the bottleneck is something this impl shares regardless of
    anchor — likely a room or constraint issue.

  • If anchored 3min has WAY more gaps than non-anchored 3min: the
    anchor is the load-bearing constraint. The cross-impl trainer
    matching may be over-blocking.
  `);
}

void main().catch((err: unknown) => {
  console.error("FATAL:", err);
  process.exit(1);
});
