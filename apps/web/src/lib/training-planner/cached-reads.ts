import "server-only";

import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { runSchedule } from "@/lib/training-planner/schedule-runner";
import type { ScheduleGenResult } from "@/app/(authenticated)/training-planner/actions";

// Cached read of the dry-run scheduler. The Calculate page renders this
// on every visit (and every tab switch) — running the solver fresh takes
// 200ms–5s on a populated impl. Caching it cuts re-visits to ~0.
//
// Why admin (service-role) client: unstable_cache callbacks can't touch
// request-scoped cookies/headers, so we can't use the user session here.
// Safety hinges on the caller:
//   1. The caller MUST have already verified the user can read this
//      impl (e.g., the Calculate page's `if (!impl) notFound()`
//      check upstream).
//   2. runSchedule in dry-run mode does no writes — it only reads.
//   3. The dry-run output is just the plan + gap reasons + diagnoses,
//      nothing the authorized user couldn't derive from classes / rooms /
//      trainers they already see.
//
// Cache is keyed by (impl_id, updated_at, org_id). Bumping updated_at
// on any edit to the impl row invalidates immediately. The 60s
// `revalidate` is a safety belt against changes the key doesn't capture
// (a class hours edit doesn't touch impl.updated_at, but it would
// invalidate the dry-run plan).

export const dryRunScheduleCached = unstable_cache(
  async (
    implementationId: string,
    // cacheBuster is read indirectly via the unstable_cache key — pass
    // impl.updated_at here so any edit to the impl row busts the cache.
    cacheBuster: string,
    orgId: string,
  ): Promise<ScheduleGenResult | null> => {
    void cacheBuster;
    const admin = createAdminClient();
    // department_id is only consulted by runSchedule when writing new
    // sessions, which a dry-run never does. Pass empty so we don't have
    // to look it up just to satisfy the type.
    const result = await runSchedule(admin, orgId, "", implementationId, [], {
      dryRun: true,
    });
    if (!result.ok) return null;
    return result.data;
  },
  // v2: switched from legacy SQL RPC to in-process CSP solver. Old cache
  // entries don't carry diagnoses / headline_fix and must be invalidated.
  ["dry-run-schedule-v2"],
  { revalidate: 60 },
);
