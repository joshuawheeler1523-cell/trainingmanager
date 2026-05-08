import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import {
  sessionsNeeded,
  type ImplClass,
  type ImplRoom,
  type ImplTrainer,
  type Implementation,
} from "@arbor/shared";

type Params = Promise<{ id: string }>;

// Step 6 placeholder. Phase 7.2 will replace this with the live capacity
// calculator + session-generation RPC. For now, we surface the inputs and a
// rough utilization preview so users see what the calculator will run on.

export default async function CalculatePage({ params }: { params: Params }) {
  const { id } = await params;
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) notFound();

  const [{ data: impl }, { data: rooms }, { data: trainers }, { data: classes }] =
    await Promise.all([
      supabase
        .from("implementations")
        .select("*")
        .eq("id", id)
        .eq("org_id", orgId)
        .is("deleted_at", null)
        .maybeSingle(),
      supabase.from("impl_rooms").select("*").eq("implementation_id", id).eq("org_id", orgId),
      supabase.from("impl_trainers").select("*").eq("implementation_id", id).eq("org_id", orgId),
      supabase.from("impl_classes").select("*").eq("implementation_id", id).eq("org_id", orgId),
    ]);

  if (!impl) notFound();

  const i = impl as Implementation;
  const roomList = (rooms ?? []) as ImplRoom[];
  const trainerList = (trainers ?? []) as ImplTrainer[];
  const classList = (classes ?? []) as ImplClass[];

  // Window weeks (rough — counts calendar weeks between window dates)
  const windowWeeks = (() => {
    if (!i.window_start_date || !i.window_end_date) return 0;
    const start = new Date(i.window_start_date + "T00:00:00Z");
    const end = new Date(i.window_end_date + "T00:00:00Z");
    return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (86400000 * 7)));
  })();

  const totalSessions = classList.reduce((acc, c) => acc + sessionsNeeded(c), 0);
  const totalTrainerHoursRequired = classList.reduce(
    (acc, c) => acc + sessionsNeeded(c) * c.hours_per_session,
    0,
  );
  const totalTrainerHoursAvailable = trainerList.reduce(
    (acc, t) => acc + t.availability_hours_per_week * windowWeeks,
    0,
  );
  const totalRoomHoursAvailable = roomList.reduce((acc, r) => {
    return acc + r.available_hours_per_day * r.available_days_of_week.length * windowWeeks;
  }, 0);

  const trainerUtil =
    totalTrainerHoursAvailable > 0
      ? (totalTrainerHoursRequired / totalTrainerHoursAvailable) * 100
      : null;
  const roomUtil =
    totalRoomHoursAvailable > 0
      ? (totalTrainerHoursRequired / totalRoomHoursAvailable) * 100
      : null;

  const ready = roomList.length > 0 && trainerList.length > 0 && classList.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-foreground text-lg font-semibold">Capacity calculation</h2>
        <p className="text-muted-foreground mt-1 text-xs">
          The full scheduler runs in Phase 7.2. The numbers below are a static preview computed from
          your inputs.
        </p>
      </div>

      {!ready && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
          Add at least one room, one trainer, and one class before running the calculator.{" "}
          {roomList.length === 0 && (
            <Link href={`/training-planner/${id}/rooms`} className="font-medium underline">
              Go to rooms
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card label="Window">
          <p className="text-foreground text-sm">
            {i.window_start_date} → {i.window_end_date}
          </p>
          <p className="text-muted-foreground text-xs">{windowWeeks.toString()} weeks</p>
          <p className="text-muted-foreground text-xs">Go-live: {i.go_live_date ?? "—"}</p>
        </Card>
        <Card label="Sessions needed">
          <p className="text-foreground text-2xl font-semibold tabular-nums">
            {totalSessions.toString()}
          </p>
          <p className="text-muted-foreground text-xs">
            across {classList.length.toString()} classes
          </p>
        </Card>
        <Card label="Trainer hours required">
          <p className="text-foreground text-2xl font-semibold tabular-nums">
            {totalTrainerHoursRequired.toFixed(0)}h
          </p>
          <p className="text-muted-foreground text-xs">
            available: {totalTrainerHoursAvailable.toFixed(0)}h
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <UtilCard label="Trainer utilization" pct={trainerUtil} />
        <UtilCard label="Room utilization" pct={roomUtil} />
      </div>

      <div className="border-border flex items-center justify-between border-t pt-4">
        <Link
          href={`/training-planner/${id}/classes`}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          ← Back
        </Link>
        <Link
          href={`/training-planner/${id}/schedule`}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium"
        >
          Continue to Schedule →
        </Link>
      </div>
    </div>
  );
}

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-border bg-background rounded-lg border p-4">
      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">{label}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function UtilCard({ label, pct }: { label: string; pct: number | null }) {
  const tone =
    pct == null
      ? "text-muted-foreground"
      : pct >= 100
        ? "text-destructive"
        : pct >= 80
          ? "text-amber-600 dark:text-amber-400"
          : "text-emerald-600 dark:text-emerald-400";
  return (
    <div className="border-border bg-background rounded-lg border p-4">
      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${tone}`}>
        {pct == null ? "—" : `${pct.toFixed(0)}%`}
      </p>
      <p className="text-muted-foreground text-xs">
        {pct == null
          ? "Need rooms, trainers, and classes."
          : pct >= 100
            ? "Over capacity — add resources or descope."
            : pct >= 80
              ? "Near capacity — leaves no buffer."
              : "Healthy headroom."}
      </p>
    </div>
  );
}
