import "server-only";

import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ScheduleGenResult } from "@/app/(authenticated)/training-planner/actions";

// Cached read of the dry-run scheduler. The Calculate page renders this
// on every visit (and every tab switch) — the underlying SQL function
// takes 200–800ms on a populated impl. Caching it cuts re-visits to ~0.
//
// Why admin (service-role) client: unstable_cache callbacks can't touch
// request-scoped cookies/headers, so we can't use the user session here.
// Safety hinges on the caller:
//   1. The caller MUST have already verified the user can read this
//      impl (e.g., the Calculate page's `if (!impl) notFound()`
//      check upstream).
//   2. generate_implementation_schedule is security invoker AND does
//      no writes in dry-run mode.
//   3. The dry-run output is just the plan + gap reasons — nothing
//      the authorized user couldn't derive from classes/rooms/trainers
//      they already see.
//
// Cache is keyed by (impl_id, updated_at). Bumping updated_at on any
// edit to the impl row invalidates immediately. The 60s `revalidate` is
// a safety belt against changes the key doesn't capture (a class hours
// edit doesn't touch impl.updated_at, but it would invalidate the
// dry-run plan).

export const dryRunScheduleCached = unstable_cache(
  async (
    implementationId: string,
    // cacheBuster is read indirectly via the unstable_cache key — pass
    // impl.updated_at here so any edit to the impl row busts the cache.
    cacheBuster: string,
  ): Promise<ScheduleGenResult | null> => {
    void cacheBuster;
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("generate_implementation_schedule", {
      p_implementation_id: implementationId,
      p_dry_run: true,
    });
    if (error) return null;
    return data as ScheduleGenResult;
  },
  ["dry-run-schedule-v1"],
  { revalidate: 60 },
);
