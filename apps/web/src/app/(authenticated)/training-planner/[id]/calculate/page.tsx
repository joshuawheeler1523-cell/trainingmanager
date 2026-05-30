import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ClassDiagnosis } from "@/lib/training-planner/schedule-solver";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import type { Implementation, ImplRoom, ImplTrainerUnavailability } from "@arbor/shared";
import {
  computeFeasibility,
  type FeasibilityResult,
  type FeasibilityVerdict,
  type Recommendation,
  type TrainerUnavailability,
} from "@/lib/training-planner/feasibility";
// ClassFeasibility / VerdictBanner / ClassFeasibilityTable / ClassRow /
// UtilizationCards were removed as part of the redesign — they conveyed
// information already shown by YesNoPanel + DiagnosisCard + SummaryCards.
import { type ScheduleGenResult } from "../../actions";
import { dryRunScheduleCached } from "@/lib/training-planner/cached-reads";
import BuildModeSection from "./build-mode-section";

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
    { data: unavailability },
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
    // PTO / unavailability for this impl's trainers.
    supabase
      .from("impl_trainer_unavailability")
      .select("impl_trainer_id, starts_at, ends_at, reason")
      .eq("org_id", orgId),
    supabase
      .from("impl_sessions")
      .select("*", { count: "exact", head: true })
      .eq("implementation_id", id)
      .eq("org_id", orgId),
  ]);

  if (!impl) notFound();

  // PTO/unavailability windows — only those for this impl's trainers.
  const thisImplTrainerIds = new Set((trainers ?? []).map((t) => t.id));
  const unavailabilityByTrainer = new Map<string, TrainerUnavailability[]>();
  for (const u of (unavailability ?? []) as Pick<
    ImplTrainerUnavailability,
    "impl_trainer_id" | "starts_at" | "ends_at" | "reason"
  >[]) {
    if (!thisImplTrainerIds.has(u.impl_trainer_id)) continue;
    const list = unavailabilityByTrainer.get(u.impl_trainer_id) ?? [];
    list.push({
      start: u.starts_at,
      end: u.ends_at,
      ...(u.reason ? { reason: u.reason } : {}),
    });
    unavailabilityByTrainer.set(u.impl_trainer_id, list);
  }

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
    unavailabilityByTrainer,
  });

  // Authoritative unscheduled count + reasons come from running the CSP
  // solver in dry-run mode — same planning math the Generate Schedule
  // button uses, just without writing rows. The in-memory simulator above
  // drifts on some configurations (notably single-trainer class slates),
  // so we override its unscheduledSessions with the solver's gap list.
  // Skipped when the impl can't be scheduled yet (no window dates, no
  // classes, etc.) since the solver would just raise.
  let dryRun: ScheduleGenResult | null = null;
  if (implTyped.window_start_date && implTyped.window_end_date && (classes?.length ?? 0) > 0) {
    // Cached read: bust on impl.updated_at so any edit to the impl row
    // forces a recompute. The Calculate page renders frequently while a
    // planner is iterating; without caching, every tab-switch reruns
    // the CSP solver (200ms–5s).
    dryRun = await dryRunScheduleCached(id, implTyped.updated_at, orgId);
  }
  if (dryRun) {
    feas.unscheduledSessions = dryRun.capacity_gaps.length;
    // Re-derive verdict from SQL truth. The verdict was computed inside
    // computeFeasibility() using the simulator's drift-prone count; without
    // this override the banner can disagree with the actual SQL plan (e.g.,
    // sim says "infeasible" while dry-run cleanly placed everything). The
    // utilization-based "tight" branch stays as the in-memory simulator's
    // estimate since the SQL doesn't return per-resource utilization.
    if (dryRun.capacity_gaps.length === 0 && feas.readyBlockers.length === 0) {
      const trainerOver = feas.trainerUtilizationPct !== null && feas.trainerUtilizationPct >= 100;
      const roomOver = feas.roomUtilizationPct !== null && feas.roomUtilizationPct >= 100;
      const trainerTight = feas.trainerUtilizationPct !== null && feas.trainerUtilizationPct >= 80;
      const roomTight = feas.roomUtilizationPct !== null && feas.roomUtilizationPct >= 80;
      feas.verdict =
        trainerOver || roomOver ? "infeasible" : trainerTight || roomTight ? "tight" : "feasible";
    } else if (dryRun.capacity_gaps.length > 0) {
      feas.verdict = "infeasible";
    }
  }

  // YES = SQL dry-run placed every needed session AND no setup blockers
  //       (classes need rooms / trainers assigned, window dates set, etc.).
  // NO  = anything below that. A "tight" verdict still answers YES — the
  //       plan fits, it's just utilization-hot. The big banner says yes/no,
  //       the lower VerdictBanner adds the tight nuance.
  const canSchedule =
    !!dryRun && dryRun.capacity_gaps.length === 0 && feas.readyBlockers.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-foreground text-lg font-semibold">Capacity calculation</h2>
        <p className="text-muted-foreground mt-1 text-xs">
          Whether your current rooms, trainers, and window can absorb the training — and, if not,
          exactly what to add. Run <strong>Generate Schedule</strong> below to commit a draft.
        </p>
      </div>

      <YesNoPanel
        canSchedule={canSchedule}
        dryRun={dryRun}
        readyBlockers={feas.readyBlockers}
        verdict={feas.verdict}
      />

      <SummaryCards result={feas} impl={implTyped} />

      {/* Why it doesn't fit + how to fix it sit next to each other so the
          user reads "NO" → "the bottleneck" → "the fix" in one scroll. */}
      {dryRun && dryRun.capacity_gaps.length > 0 && (
        <>
          <UnscheduledReasonsPanel dryRun={dryRun} />
          <RecommendationsBlock result={feas} />
        </>
      )}

      <ResourceForecastPanel result={feas} rooms={rooms ?? []} />

      {/* Completion estimate is only useful when the plan actually fits.
          When infeasible the YesNoPanel + diagnoses already say "can't
          complete" — repeating it as a card is noise. */}
      {canSchedule && <CompletionCard result={feas} impl={implTyped} />}

      <BuildModeSection
        implementationId={id}
        initialMode={implTyped.schedule_mode}
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

function YesNoPanel({
  canSchedule,
  dryRun,
  readyBlockers,
  verdict,
}: {
  canSchedule: boolean;
  dryRun: ScheduleGenResult | null;
  readyBlockers: string[];
  verdict: FeasibilityVerdict;
}) {
  // Sub-headline summarizes the *why*: setup blockers (no window dates, no
  // rooms, classes missing trainers) take precedence over capacity gaps;
  // either of those is a definitive NO. If dry-run couldn't run at all,
  // surface that explicitly — the user shouldn't be guessing whether the
  // page just failed to query the scheduler.
  let why: string;
  if (canSchedule) {
    if (verdict === "tight") {
      why =
        "Every session fits — but a resource is ≥80% utilized, so any sick day or no-show puts the plan at risk.";
    } else {
      why = `All ${dryRun ? dryRun.sessions.toString() : ""} sessions fit within the window, before the go-live buffer.`;
    }
  } else if (!dryRun) {
    why =
      readyBlockers.length > 0
        ? (readyBlockers[0] ?? "Setup is incomplete — finish earlier steps first.")
        : "Set window start and end dates on the Setup step, then add at least one class.";
  } else if (readyBlockers.length > 0) {
    why = readyBlockers[0] ?? "Setup is incomplete.";
  } else {
    const gapCount = dryRun.capacity_gaps.length;
    const classCount = new Set(dryRun.capacity_gaps.map((g) => g.class_id)).size;
    why = `${gapCount.toString()} session${gapCount === 1 ? "" : "s"} across ${classCount.toString()} class${classCount === 1 ? "" : "es"} can't be placed — see "${gapCount === 1 ? "the reason" : "the reasons"}" below.`;
  }

  const cls = canSchedule
    ? "border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/30"
    : "border-rose-300 bg-rose-50 dark:border-rose-700 dark:bg-rose-950/30";
  const labelCls = canSchedule
    ? "text-emerald-700 dark:text-emerald-200"
    : "text-rose-700 dark:text-rose-200";

  return (
    <div className={`rounded-lg border p-4 ${cls}`}>
      <div className="flex items-baseline gap-3">
        <span className={`text-3xl font-bold tabular-nums ${labelCls}`}>
          {canSchedule ? "YES" : "NO"}
        </span>
        <span className="text-foreground text-sm font-medium">
          Can I run this schedule with my current rooms + trainers?
        </span>
      </div>
      <p className="text-muted-foreground mt-1.5 text-xs">{why}</p>
    </div>
  );
}

function UnscheduledReasonsPanel({ dryRun }: { dryRun: ScheduleGenResult }) {
  // The in-process CSP solver emits a per-class diagnosis with a recommended
  // fix; prefer that when present. The legacy SQL RPC (still used by the
  // dry-run cache path) doesn't, so we fall back to grouping the per-session
  // gap rows by class.
  //
  // The "biggest unlock" headline and the "aggregate quick fixes" bullets
  // that used to live here were duplicates: the headline always restated
  // the first diagnosis row verbatim, and the quick-fix bullets repeated the
  // RecommendationsBlock that follows this panel. Both removed; the panel
  // now does one job — show per-class bottlenecks with their recommended fix.
  const total = dryRun.capacity_gaps.length;
  const diagnoses = dryRun.diagnoses;
  const hasRichDiagnosis = diagnoses.length > 0;

  type Group = { className: string; count: number; reason: string };
  const fallbackGroups: Group[] = (() => {
    if (hasRichDiagnosis) return [];
    const byClass = new Map<string, Group>();
    for (const gap of dryRun.capacity_gaps) {
      const g = byClass.get(gap.class_id) ?? {
        className: gap.class_name,
        count: 0,
        reason: gap.reason,
      };
      g.count += 1;
      byClass.set(gap.class_id, g);
    }
    return [...byClass.values()].sort((a, b) => b.count - a.count);
  })();

  return (
    <div className="border-border space-y-3 rounded-md border bg-rose-50/40 p-3 dark:bg-rose-950/20">
      <div className="flex items-baseline justify-between">
        <p className="text-foreground text-sm font-semibold">Why it doesn&apos;t fit</p>
        <p className="text-muted-foreground text-[11px]">
          {total.toString()} session{total === 1 ? "" : "s"} short, from a dry-run of the actual
          scheduler. No rows were written.
        </p>
      </div>

      {hasRichDiagnosis ? (
        <ul className="space-y-2">
          {diagnoses.map((d) => (
            <DiagnosisCard key={d.classId} d={d} />
          ))}
        </ul>
      ) : (
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="px-2 py-1 text-left font-medium uppercase tracking-wide">Class</th>
              <th className="px-2 py-1 text-right font-medium uppercase tracking-wide">Unplaced</th>
              <th className="px-2 py-1 text-left font-medium uppercase tracking-wide">Reason</th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {fallbackGroups.map((g) => (
              <tr key={g.className}>
                <td className="text-foreground px-2 py-1.5 font-medium">{g.className}</td>
                <td className="text-foreground px-2 py-1.5 text-right tabular-nums">
                  {g.count.toString()}
                </td>
                <td className="text-muted-foreground px-2 py-1.5">{g.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function DiagnosisCard({ d }: { d: ClassDiagnosis }) {
  // The bottleneck badge now reads "Bottleneck: trainer hours" instead of
  // a bare "TRAINER HOURS" so it's clearly a category, not a data label.
  //
  // The "Assigned trainers: Priya (4h/wk)" line that used to render below
  // recommendedFix was removed because (a) recommendedFix already names the
  // trainer slate and quotes the actual slate-hours-free figure, and
  // (b) the per-trainer (Nh/wk) detail confused readers when the slate has
  // multiple trainers — the visible number for one trainer didn't reconcile
  // with the slate's total available hours mentioned in the same paragraph.
  return (
    <li className="border-border bg-background rounded-md border p-2.5">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-foreground text-sm font-semibold">{d.className}</span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {d.unplacedSessions.toString()} session{d.unplacedSessions === 1 ? "" : "s"} short
        </span>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
          Bottleneck: {bottleneckLabel(d.bottleneck)}
        </span>
      </div>
      <p className="text-foreground mt-1 text-xs leading-snug">{d.recommendedFix}</p>
    </li>
  );
}

function bottleneckLabel(b: ClassDiagnosis["bottleneck"]): string {
  switch (b) {
    case "no_trainers_assigned":
      return "no trainer";
    case "no_eligible_room":
      return "no room";
    case "room_capacity":
      return "room capacity";
    case "trainer_capacity":
      return "trainer hours";
    case "room_busy_or_window":
      return "room / window";
  }
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
      return `Reduce "${r.className}" learners per session to ${r.learners.toString()} so it fits an existing room (adds ${r.extraSessions.toString()} session${r.extraSessions === 1 ? "" : "s"}).`;
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
  const targetLabel = impl.go_live_date
    ? `Go-live ${impl.go_live_date} − ${impl.go_live_buffer_days.toString()}d buffer`
    : "Window end";
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
          <p className="text-muted-foreground text-[11px]">Target</p>
          <p className="text-foreground text-sm font-semibold tabular-nums">
            {result.targetCompletionDate ?? impl.window_end_date ?? "—"}
          </p>
          <p className="text-muted-foreground text-[10px]">{targetLabel}</p>
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
    </div>
  );
}

function ResourceForecastPanel({
  result,
  rooms,
}: {
  result: FeasibilityResult;
  rooms: ImplRoom[];
}) {
  // The right-column "Trainer headcount" sub-card was removed: have / short
  // is already conveyed by the Trainer Hours summary card up top + the
  // diagnoses panel. The "headcount is a floor" footnote it carried was the
  // only unique signal; that nuance is captured in the per-class diagnoses
  // when a class has a tight trainer pool.
  const fc = result.resourceForecast;
  const hasClasses = result.classFeasibility.length > 0;

  if (!hasClasses) return null;

  const roomsHave = countRoomsByTier(rooms);

  return (
    <div className="border-border bg-background rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-foreground text-sm font-semibold">Resource forecast</p>
          <p className="text-muted-foreground text-xs">
            What you need at minimum to absorb this workload. A larger room can always substitute
            for a smaller one — these are floors, not ceilings.
          </p>
        </div>
        <div className="text-muted-foreground text-right text-[11px] tabular-nums">
          {fc.workingDays.toString()} working days · {fc.effectiveHoursPerDay.toFixed(1)} h/day
          window
        </div>
      </div>

      <div className="mt-4">
        {/* Rooms-by-seat-capacity table */}
        <div>
          <p className="text-muted-foreground mb-2 text-[11px] font-medium uppercase tracking-wide">
            Rooms by seat capacity
          </p>
          {fc.tiers.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No room demand — no classes have sessions.
            </p>
          ) : (
            <div className="border-border overflow-hidden rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-surface text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium uppercase tracking-wide">
                      Seats
                    </th>
                    <th className="px-3 py-2 text-right font-medium uppercase tracking-wide">
                      Need
                    </th>
                    <th className="px-3 py-2 text-right font-medium uppercase tracking-wide">
                      Have
                    </th>
                    <th className="px-3 py-2 text-center font-medium uppercase tracking-wide">
                      Status
                    </th>
                    <th className="px-3 py-2 text-left font-medium uppercase tracking-wide">
                      Classes
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {fc.tiers.map((t) => {
                    const haveAtTier = countAtOrAboveSeats(roomsHave, t.minSeats);
                    const short = Math.max(0, t.roomsNeeded - haveAtTier);
                    return (
                      <tr key={t.minSeats} className="hover:bg-surface/40 align-top">
                        <td className="text-foreground px-3 py-2 font-semibold tabular-nums">
                          ≥{t.minSeats.toString()}
                        </td>
                        <td className="text-foreground px-3 py-2 text-right tabular-nums">
                          {t.roomsNeeded.toString()}
                        </td>
                        <td className="text-foreground px-3 py-2 text-right tabular-nums">
                          {haveAtTier.toString()}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {short > 0 ? (
                            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-900/40 dark:text-rose-200">
                              short {short.toString()}
                            </span>
                          ) : (
                            <span className="text-emerald-600 dark:text-emerald-400">✓</span>
                          )}
                        </td>
                        <td className="text-muted-foreground px-3 py-2">
                          {t.classNames.join(", ")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function countRoomsByTier(rooms: ImplRoom[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const r of rooms) {
    m.set(r.seat_capacity, (m.get(r.seat_capacity) ?? 0) + 1);
  }
  return m;
}

function countAtOrAboveSeats(roomsByTier: Map<number, number>, threshold: number): number {
  let n = 0;
  for (const [seats, count] of roomsByTier) if (seats >= threshold) n += count;
  return n;
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
