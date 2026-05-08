import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import type { ImplSession } from "@arbor/shared";

type Params = Promise<{ id: string }>;

// Step 7 placeholder. Phase 7.2 ships the calendar view + auto-scheduler.
// For now we list any sessions that exist (none yet, until 7.2's RPC runs).

export default async function SchedulePage({ params }: { params: Params }) {
  const { id } = await params;
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) notFound();

  const { data: sessions } = await supabase
    .from("impl_sessions")
    .select("*")
    .eq("implementation_id", id)
    .eq("org_id", orgId)
    .order("scheduled_start");

  const sessionList = (sessions ?? []) as ImplSession[];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-foreground text-lg font-semibold">Schedule</h2>
        <p className="text-muted-foreground mt-1 text-xs">
          The full conflict-aware calendar lands in Phase 7.2 (Generate Schedule). Until then, any
          manually-created sessions will appear here.
        </p>
      </div>

      {sessionList.length === 0 ? (
        <div className="border-border bg-surface rounded-lg border border-dashed p-12 text-center">
          <p className="text-foreground text-sm font-medium">No sessions yet</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Run &ldquo;Generate Schedule&rdquo; once Phase 7.2 ships, or wait for the calendar UI.
          </p>
        </div>
      ) : (
        <ul className="border-border divide-border divide-y rounded-lg border text-sm">
          {sessionList.map((s) => (
            <li key={s.id} className="flex items-center justify-between px-3 py-2">
              <span className="text-foreground tabular-nums">{s.scheduled_start}</span>
              <span className="text-muted-foreground text-xs capitalize">{s.status}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="border-border flex items-center justify-between border-t pt-4">
        <Link
          href={`/training-planner/${id}/calculate`}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          ← Back
        </Link>
      </div>
    </div>
  );
}
