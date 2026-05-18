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
// Invalidation:
//   - Cache key includes (impl_id, updated_at, org_id). Edits to the
//     impl row itself bump updated_at and immediately re-key.
//   - Per-impl tag `calc:<impl_id>` (set at definition time, since
//     unstable_cache tags are static) lets any mutation server action
//     call revalidateTag(calcTag(impl_id)) to invalidate the cache for
//     just that impl — without needing the impl row's updated_at to
//     change. To get a per-impl tag we build a fresh unstable_cache
//     closure per impl, memoized in `byImpl`.
//   - 60s revalidate is the safety belt for anything we forgot to wire.

/** Tag name for invalidating the dry-run cache for a single impl. Mutation
 *  server actions call `revalidateTag(calcTag(implementationId))` after
 *  writing solver-relevant data (rooms, trainers, classes, slate, etc.). */
export function calcTag(implementationId: string): string {
  return `calc:${implementationId}`;
}

// Per-impl cache closures. unstable_cache tags are static at definition,
// so we generate one closure per implementationId on first use and reuse
// it forever. The closure's identity (and the tag it carries) is the
// per-impl scope.
const byImpl = new Map<
  string,
  (
    implementationId: string,
    cacheBuster: string,
    orgId: string,
  ) => Promise<ScheduleGenResult | null>
>();

function getCachedForImpl(implementationId: string) {
  const existing = byImpl.get(implementationId);
  if (existing) return existing;
  const fn = unstable_cache(
    async (
      innerImplementationId: string,
      cacheBuster: string,
      orgId: string,
    ): Promise<ScheduleGenResult | null> => {
      void cacheBuster;
      const admin = createAdminClient();
      const result = await runSchedule(admin, orgId, "", innerImplementationId, [], {
        dryRun: true,
      });
      if (!result.ok) return null;
      return result.data;
    },
    // v2: switched from legacy SQL RPC to in-process CSP solver. Old
    // cache entries don't carry diagnoses / headline_fix and must be
    // invalidated.
    ["dry-run-schedule-v2", implementationId],
    { revalidate: 60, tags: [calcTag(implementationId)] },
  );
  byImpl.set(implementationId, fn);
  return fn;
}

export async function dryRunScheduleCached(
  implementationId: string,
  cacheBuster: string,
  orgId: string,
): Promise<ScheduleGenResult | null> {
  const fn = getCachedForImpl(implementationId);
  return fn(implementationId, cacheBuster, orgId);
}
