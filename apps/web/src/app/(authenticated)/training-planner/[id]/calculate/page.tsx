import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircleIcon, ExclamationTriangleIcon, XCircleIcon } from "@heroicons/react/20/solid";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import type { Implementation } from "@arbor/shared";
import {
  computeFeasibility,
  type ClassFeasibility,
  type FeasibilityResult,
  type FeasibilityVerdict,
  type Recommendation,
} from "@/lib/training-planner/feasibility";
import GenerateButton from "./generate-button";

type Params = Promise<{ id: string }>;

export default async function CalculatePage({ params }: { params: Params }) {
  const { id } = await params;
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) notFound();

  const [
    { data: impl },
    { data: rooms },
    { data: trainers },
    { data: classes },
    { data: classTrainers },
    { data: prereqs },
    { count: sessionCount },
  ] = await Promise.all([
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
    // Junction tables don't carry implementation_id; org-scope is the only
    // filter available without a join. RLS already constrains to the user's
    // org, and computeFeasibility filters down to the supplied class IDs.
    supabase.from("impl_class_trainers").select("*").eq("org_id", orgId),
    supabase.from("impl_class_prerequisites").select("*").eq("org_id", orgId),
    supabase
      .from("impl_sessions")
      .select("*", { count: "exact", head: true })
      .eq("implementation_id", id)
      .eq("org_id", orgId),
  ]);

  if (!impl) notFound();

  // Supabase widens our text-with-CHECK columns to `string`; the shared
  // Implementation type narrows status to a union. The other rows match
  // structurally, so we only cast at the implementation boundary.
  const implTyped = impl as unknown as Implementation;
  const feas = computeFeasibility({
    implementation: implTyped,
    rooms: rooms ?? [],
    trainers: trainers ?? [],
    classes: classes ?? [],
    classTrainers: classTrainers ?? [],
    prereqs: prereqs ?? [],
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-foreground text-lg font-semibold">Capacity calculation</h2>
        <p className="text-muted-foreground mt-1 text-xs">
          Whether your current rooms, trainers, and window can absorb the training — and, if not,
          exactly what to add. Run <strong>Generate Schedule</strong> below to commit a draft.
        </p>
      </div>

      <VerdictBanner result={feas} />

      <SummaryCards result={feas} impl={implTyped} />

      <ClassFeasibilityTable result={feas} implementationId={id} />

      <UtilizationCards result={feas} />

      <RecommendationsBlock result={feas} />

      <CompletionCard result={feas} impl={implTyped} />

      <GenerateButton
        implementationId={id}
        ready={feas.ready}
        existingSessions={sessionCount ?? 0}
      />

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

// ── Components ─────────────────────────────────────────────────────────────

function VerdictBanner({ result }: { result: FeasibilityResult }) {
  const v = result.verdict;
  const cls: Record<FeasibilityVerdict, string> = {
    feasible:
      "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-100",
    tight:
      "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100",
    infeasible:
      "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-700 dark:bg-rose-950/30 dark:text-rose-100",
  };
  const Icon =
    v === "feasible" ? CheckCircleIcon : v === "tight" ? ExclamationTriangleIcon : XCircleIcon;
  const heading =
    v === "feasible"
      ? "Looks feasible"
      : v === "tight"
        ? "Tight — no buffer"
        : "Infeasible as configured";
  const subline = (() => {
    if (v === "feasible") return "Current resources should cover the training within the window.";
    if (v === "tight")
      return "≥80% utilization on a resource. Any sick day or no-show puts the plan at risk.";
    if (result.readyBlockers.length > 0) return result.readyBlockers[0] ?? "";
    if (result.unscheduledSessions > 0)
      return `${result.unscheduledSessions.toString()} session${result.unscheduledSessions === 1 ? "" : "s"} can't fit in the window.`;
    return "One or more resources is over 100% utilized.";
  })();
  return (
    <div className={`flex items-start gap-3 rounded-md border p-3 ${cls[v]}`}>
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <div className="text-sm">
        <p className="font-semibold">{heading}</p>
        <p className="mt-0.5 text-xs">{subline}</p>
      </div>
    </div>
  );
}

function SummaryCards({ result, impl }: { result: FeasibilityResult; impl: Implementation }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <Card label="Window">
        <p className="text-foreground text-sm">
          {impl.window_start_date ?? "—"} → {impl.window_end_date ?? "—"}
        </p>
        <p className="text-muted-foreground text-xs">
          {result.windowDays.toString()} days · {result.windowWeeks.toString()}{" "}
          {result.windowWeeks === 1 ? "week" : "weeks"}
        </p>
        <p className="text-muted-foreground text-xs">Go-live: {impl.go_live_date ?? "—"}</p>
      </Card>
      <Card label="Sessions needed">
        <p className="text-foreground text-2xl font-semibold tabular-nums">
          {result.totalSessionsNeeded.toString()}
        </p>
        <p className="text-muted-foreground text-xs">
          across {result.classFeasibility.length.toString()} classes
        </p>
      </Card>
      <Card label="Trainer hours">
        <p className="text-foreground text-2xl font-semibold tabular-nums">
          {result.totalTrainerHoursNeeded.toFixed(0)}h
          <span className="text-muted-foreground text-sm font-normal">
            {" "}
            / {result.totalTrainerHoursAvailable.toFixed(0)}h
          </span>
        </p>
        <p className={`text-xs ${utilTone(result.trainerUtilizationPct)} tabular-nums`}>
          {result.trainerUtilizationPct === null
            ? "no trainers"
            : `${result.trainerUtilizationPct.toFixed(0)}% utilization`}
        </p>
      </Card>
    </div>
  );
}

function ClassFeasibilityTable({
  result,
  implementationId,
}: {
  result: FeasibilityResult;
  implementationId: string;
}) {
  if (result.classFeasibility.length === 0) {
    return (
      <div className="border-border bg-background rounded-lg border p-4 text-xs">
        <p className="text-muted-foreground">
          No classes defined yet.{" "}
          <Link
            href={`/training-planner/${implementationId}/classes`}
            className="font-medium underline"
          >
            Go to classes →
          </Link>
        </p>
      </div>
    );
  }
  return (
    <div className="border-border bg-background overflow-hidden rounded-lg border">
      <div className="border-border border-b px-4 py-2">
        <p className="text-foreground text-sm font-semibold">Per-class feasibility</p>
        <p className="text-muted-foreground text-xs">
          A row turns red when no current resource can host the class. Fix red rows before
          generating.
        </p>
      </div>
      <table className="text-foreground w-full text-left text-xs">
        <thead className="text-muted-foreground bg-surface text-[10px] font-medium uppercase tracking-wide">
          <tr>
            <th className="px-3 py-2">Class</th>
            <th className="px-3 py-2 text-right">Sessions</th>
            <th className="px-3 py-2 text-right">Hours</th>
            <th className="px-3 py-2 text-center">Room</th>
            <th className="px-3 py-2 text-center">Trainer</th>
            <th className="px-3 py-2 text-center">Prereq</th>
            <th className="px-3 py-2">Blockers</th>
          </tr>
        </thead>
        <tbody className="divide-border divide-y">
          {result.classFeasibility.map((cf) => (
            <ClassRow key={cf.classId} cf={cf} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ClassRow({ cf }: { cf: ClassFeasibility }) {
  const rowTone = cf.blockers.length > 0 ? "bg-rose-50/40 dark:bg-rose-950/15" : "";
  return (
    <tr className={rowTone}>
      <td className="px-3 py-2 font-medium">{cf.className}</td>
      <td className="px-3 py-2 text-right tabular-nums">{cf.sessionsNeeded.toString()}</td>
      <td className="px-3 py-2 text-right tabular-nums">{cf.totalHoursNeeded.toFixed(1)}</td>
      <td className="px-3 py-2 text-center">
        <Check ok={cf.roomCapacityOk} />
      </td>
      <td className="px-3 py-2 text-center">
        <Check ok={cf.trainerSlateOk} />
      </td>
      <td className="px-3 py-2 text-center">
        <Check ok={cf.prereqReachable} />
      </td>
      <td className="text-muted-foreground px-3 py-2">
        {cf.blockers.length === 0 ? "—" : cf.blockers.join(" · ")}
      </td>
    </tr>
  );
}

function Check({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="text-emerald-600 dark:text-emerald-400" aria-label="OK">
      ✓
    </span>
  ) : (
    <span className="text-rose-600 dark:text-rose-400" aria-label="Blocker">
      ✗
    </span>
  );
}

function UtilizationCards({ result }: { result: FeasibilityResult }) {
  const topTrainer = result.trainerUtilization[0] ?? null;
  const topRoom = result.roomUtilization[0] ?? null;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="border-border bg-background rounded-lg border p-4">
        <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
          Top-utilized trainer
        </p>
        {topTrainer ? (
          <>
            <p className="text-foreground mt-2 truncate text-sm font-semibold">{topTrainer.name}</p>
            <p
              className={`mt-1 text-2xl font-semibold tabular-nums ${utilTone(topTrainer.utilizationPct)}`}
            >
              {topTrainer.utilizationPct.toFixed(0)}%
            </p>
            <p className="text-muted-foreground text-xs tabular-nums">
              {topTrainer.hoursAssigned.toFixed(1)}h assigned ·{" "}
              {topTrainer.hoursAvailable.toFixed(0)}h available
            </p>
          </>
        ) : (
          <p className="text-muted-foreground mt-2 text-sm">No trainers.</p>
        )}
        {result.trainerUtilization.length > 1 && (
          <div className="border-border text-muted-foreground mt-3 space-y-0.5 border-t pt-2 text-[11px]">
            {result.trainerUtilization.slice(1, 4).map((t) => (
              <p key={t.id} className="flex justify-between tabular-nums">
                <span className="truncate">{t.name}</span>
                <span className={utilTone(t.utilizationPct)}>{t.utilizationPct.toFixed(0)}%</span>
              </p>
            ))}
          </div>
        )}
      </div>
      <div className="border-border bg-background rounded-lg border p-4">
        <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
          Top-utilized room
        </p>
        {topRoom ? (
          <>
            <p className="text-foreground mt-2 truncate text-sm font-semibold">{topRoom.name}</p>
            <p
              className={`mt-1 text-2xl font-semibold tabular-nums ${utilTone(topRoom.utilizationPct)}`}
            >
              {topRoom.utilizationPct.toFixed(0)}%
            </p>
            <p className="text-muted-foreground text-xs tabular-nums">
              {topRoom.hoursAssigned.toFixed(1)}h assigned · {topRoom.hoursAvailable.toFixed(0)}h
              available
            </p>
          </>
        ) : (
          <p className="text-muted-foreground mt-2 text-sm">No rooms.</p>
        )}
        {result.roomUtilization.length > 1 && (
          <div className="border-border text-muted-foreground mt-3 space-y-0.5 border-t pt-2 text-[11px]">
            {result.roomUtilization.slice(1, 4).map((r) => (
              <p key={r.id} className="flex justify-between tabular-nums">
                <span className="truncate">{r.name}</span>
                <span className={utilTone(r.utilizationPct)}>{r.utilizationPct.toFixed(0)}%</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RecommendationsBlock({ result }: { result: FeasibilityResult }) {
  if (result.recommendations.length === 0) return null;
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/20">
      <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
        To close the gap, pick one of:
      </p>
      <ul className="mt-2 space-y-1 text-xs text-amber-900 dark:text-amber-100">
        {result.recommendations.map((r, i) => (
          <li key={i} className="leading-relaxed">
            • {recommendationLabel(r)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function recommendationLabel(r: Recommendation): string {
  switch (r.kind) {
    case "assign_trainer":
      return `Assign at least one trainer to "${r.className}".`;
    case "add_capacity_room":
      return `Add a room seating ≥${r.minSeats.toString()} learners (needed for: ${r.classNames.join(", ")}).`;
    case "add_trainers":
      return `Add ${r.count.toString()} more trainer${r.count === 1 ? "" : "s"} at ~${r.hoursPerWeek.toString()} h/wk each.`;
    case "add_trainer_hours_per_week":
      return `Increase trainer capacity by ${r.hours.toString()} h/wk across the team.`;
    case "add_rooms":
      return `Add ${r.count.toString()} more room${r.count === 1 ? "" : "s"} of comparable capacity.`;
    case "extend_window_weeks":
      return `Extend the training window by ${r.weeks.toString()} week${r.weeks === 1 ? "" : "s"}.`;
    case "reduce_per_session_to":
      return `Reduce per-session learners to ${r.learners.toString()} (adds ~${r.extraSessions.toString()} sessions but lowers room-size requirement).`;
  }
}

function CompletionCard({ result, impl }: { result: FeasibilityResult; impl: Implementation }) {
  if (!result.estimatedCompletionDate) {
    return (
      <div className="border-border bg-background rounded-lg border p-4">
        <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
          Estimated completion
        </p>
        <p className="text-muted-foreground mt-2 text-sm">
          {result.unscheduledSessions > 0
            ? `Can't complete in window — ${result.unscheduledSessions.toString()} session${result.unscheduledSessions === 1 ? "" : "s"} unschedulable.`
            : "Set window dates to estimate."}
        </p>
      </div>
    );
  }
  const isOver = result.daysOverTarget > 0;
  return (
    <div className="border-border bg-background rounded-lg border p-4">
      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
        Estimated completion
      </p>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div>
          <p className="text-muted-foreground text-[11px]">Simulated</p>
          <p className="text-foreground text-sm font-semibold tabular-nums">
            {result.estimatedCompletionDate}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-[11px]">Window end</p>
          <p className="text-foreground text-sm font-semibold tabular-nums">
            {impl.window_end_date ?? "—"}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-[11px]">Gap</p>
          <p
            className={`text-sm font-semibold tabular-nums ${isOver ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}
          >
            {isOver
              ? `+${result.daysOverTarget.toString()} day${result.daysOverTarget === 1 ? "" : "s"} late`
              : "On time"}
          </p>
        </div>
      </div>
      {impl.go_live_date && (
        <p className="text-muted-foreground mt-2 text-[11px]">
          Go-live: {impl.go_live_date}. (Buffer-aware comparison comes in Phase D.)
        </p>
      )}
    </div>
  );
}

// ── Small bits ─────────────────────────────────────────────────────────────

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-border bg-background rounded-lg border p-4">
      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">{label}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function utilTone(pct: number | null): string {
  if (pct === null) return "text-muted-foreground";
  if (pct >= 100) return "text-rose-600 dark:text-rose-400";
  if (pct >= 80) return "text-amber-600 dark:text-amber-400";
  return "text-emerald-600 dark:text-emerald-400";
}
