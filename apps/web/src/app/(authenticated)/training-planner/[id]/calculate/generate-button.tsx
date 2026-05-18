"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ExclamationTriangleIcon,
  LightBulbIcon,
  LockClosedIcon,
  SparklesIcon,
  XCircleIcon,
} from "@heroicons/react/20/solid";
import { generateSchedule, type ScheduleGenResult } from "../../actions";
import type { ClassDiagnosis } from "@/lib/training-planner/schedule-solver";

// Other live impls in the same org that the planner can anchor against.
// Passed from the Calculate page server loader. Anchoring an impl tells
// the generator: "treat this other impl's sessions as immovable busy
// state when placing mine."
type AnchorOption = { id: string; name: string };

type Props = {
  implementationId: string;
  ready: boolean;
  existingSessions: number;
  availableAnchors: AnchorOption[];
};

export default function GenerateButton({
  implementationId,
  ready,
  existingSessions,
  availableAnchors,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ScheduleGenResult | null>(null);
  const [selectedAnchors, setSelectedAnchors] = useState<Set<string>>(new Set());

  const anchorMode = selectedAnchors.size > 0;

  function toggleAnchor(id: string) {
    const next = new Set(selectedAnchors);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedAnchors(next);
  }

  function handleGenerate() {
    if (!ready) return;
    if (existingSessions > 0 && !anchorMode) {
      // Normal (non-anchor) regen wipes drafts before placing — confirm
      // this destructive step. Anchor mode is atomic and skipped the
      // wipe entirely on failure, so we don't need to scare-prompt.
      if (
        !confirm(
          `Regenerating will delete the existing ${existingSessions.toString()} draft sessions and re-run the scheduler. Published sessions are preserved. Continue?`,
        )
      ) {
        return;
      }
    }
    startTransition(async () => {
      const r = await generateSchedule(implementationId, Array.from(selectedAnchors));
      if (r.ok) {
        setResult(r.data);
        if (r.data.aborted) {
          toast.error(
            `Couldn't fit ${r.data.capacity_gaps.length.toString()} session${
              r.data.capacity_gaps.length === 1 ? "" : "s"
            } cleanly — schedule unchanged`,
          );
        } else if (r.data.conflicts > 0) {
          toast.error(
            `Generated ${r.data.sessions.toString()} sessions — ${r.data.conflicts.toString()} have capacity gaps`,
          );
        } else {
          toast.success(`Generated ${r.data.sessions.toString()} sessions, no conflicts`);
        }
        router.refresh();
      } else {
        toast.error(r.error.message);
      }
    });
  }

  const aborted = result?.aborted ?? false;
  const anchorNames = result?.anchor_impls ?? [];

  return (
    <div className="border-border bg-background space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-foreground text-sm font-semibold">Generate schedule</p>
          <p className="text-muted-foreground text-xs">
            {anchorMode
              ? `Will place sessions around ${selectedAnchors.size.toString()} anchored impl${
                  selectedAnchors.size === 1 ? "" : "s"
                }. Stops without writing if anything can't fit cleanly.`
              : existingSessions > 0
                ? `Currently ${existingSessions.toString()} sessions exist. Regenerating wipes drafts and re-runs the scheduler.`
                : "Run the greedy scheduler to place sessions on the calendar."}
          </p>
        </div>
        <button
          type="button"
          disabled={pending || !ready}
          onClick={handleGenerate}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          {anchorMode ? (
            <LockClosedIcon className="h-4 w-4" />
          ) : (
            <SparklesIcon className="h-4 w-4" />
          )}
          {pending ? "Generating…" : anchorMode ? "Generate around anchors" : "Generate schedule"}
        </button>
      </div>

      {availableAnchors.length > 0 && (
        <div className="border-border border-t pt-3">
          <p className="text-muted-foreground mb-1.5 text-[11px] font-medium uppercase tracking-wide">
            Anchor against (optional)
          </p>
          <p className="text-muted-foreground mb-2 text-[11px]">
            Pick other impls whose schedules should NOT move. The generator places this impl&apos;s
            sessions around them. If a clean plan isn&apos;t possible, the existing schedule is
            preserved — no half-rescheduling.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {availableAnchors.map((a) => {
              const selected = selectedAnchors.has(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    toggleAnchor(a.id);
                  }}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:bg-surface"
                  }`}
                >
                  {selected && <LockClosedIcon className="h-3 w-3" />}
                  {a.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {result && (
        <div className="border-border space-y-2 rounded-md border-t pt-3">
          {aborted ? (
            <div className="rounded-md border border-rose-300 bg-rose-50 p-3 dark:border-rose-700 dark:bg-rose-950/30">
              <div className="flex items-start gap-2">
                <XCircleIcon className="text-destructive h-4 w-4 shrink-0" />
                <div className="text-destructive text-xs">
                  <p className="font-semibold">Aborted — schedule unchanged</p>
                  <p className="mt-0.5">
                    Couldn&apos;t place {result.capacity_gaps.length.toString()} session
                    {result.capacity_gaps.length === 1 ? "" : "s"} cleanly while anchored against{" "}
                    {anchorNames.map((a) => a.name).join(", ")}. Existing drafts preserved. Try
                    un-anchoring, broadening the window, or adding trainers.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-foreground text-sm">
              <span className="font-semibold tabular-nums">{result.sessions.toString()}</span>{" "}
              sessions created ·{" "}
              <span
                className={
                  result.conflicts > 0
                    ? "text-destructive font-semibold tabular-nums"
                    : "font-semibold tabular-nums text-emerald-600 dark:text-emerald-400"
                }
              >
                {result.conflicts.toString()}
              </span>{" "}
              with capacity gaps
              {anchorNames.length > 0 && (
                <span className="text-muted-foreground ml-1 text-xs">
                  · anchored against {anchorNames.map((a) => a.name).join(", ")}
                </span>
              )}
            </p>
          )}

          {result.capacity_gaps.length > 0 && <DiagnosisPanel result={result} aborted={aborted} />}
        </div>
      )}
    </div>
  );
}

function DiagnosisPanel({ result, aborted }: { result: ScheduleGenResult; aborted: boolean }) {
  // Prefer the rich per-class diagnoses when the in-process solver populated
  // them. Fall back to the old per-session list when the dry-run came back
  // from the legacy SQL RPC, which doesn't emit diagnoses.
  const diagnoses = result.diagnoses;
  const headline = result.headline_fix;
  const hasRichDiagnosis = diagnoses.length > 0;

  return (
    <div className="space-y-2">
      {hasRichDiagnosis && headline && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-700 dark:bg-emerald-950/30">
          <div className="flex items-start gap-2">
            <LightBulbIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div className="text-xs text-emerald-900 dark:text-emerald-100">
              <p className="font-semibold">Biggest unlock</p>
              <p className="mt-0.5">
                {headline.recommendedFix}{" "}
                <span className="text-emerald-700/80 dark:text-emerald-200/80">
                  Would place {headline.sessionsUnblocked.toString()} of{" "}
                  {result.capacity_gaps.length.toString()} unscheduled sessions.
                </span>
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/30">
        <div className="flex items-start gap-2">
          <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="w-full text-xs text-amber-900 dark:text-amber-200">
            <p className="font-semibold">{aborted ? "Why it couldn't fit" : "Capacity gaps"}</p>
            {hasRichDiagnosis ? (
              <ul className="mt-1.5 space-y-2">
                {diagnoses.map((d) => (
                  <DiagnosisRow key={d.classId} d={d} />
                ))}
              </ul>
            ) : (
              <>
                <ul className="mt-1 space-y-0.5">
                  {result.capacity_gaps.slice(0, 10).map((g, i) => (
                    <li key={i}>
                      <span className="font-medium">{g.class_name}</span> · session{" "}
                      {g.session_index.toString()} — {g.reason}
                    </li>
                  ))}
                  {result.capacity_gaps.length > 10 && (
                    <li className="italic">
                      …{(result.capacity_gaps.length - 10).toString()} more
                    </li>
                  )}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DiagnosisRow({ d }: { d: ClassDiagnosis }) {
  return (
    <li>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-semibold">{d.className}</span>
        <span className="tabular-nums text-amber-700/80 dark:text-amber-200/80">
          {d.unplacedSessions.toString()} session{d.unplacedSessions === 1 ? "" : "s"} short
        </span>
        <span className="text-[10px] uppercase tracking-wide text-amber-700/70 dark:text-amber-200/70">
          {bottleneckLabel(d.bottleneck)}
        </span>
      </div>
      <p className="mt-0.5 leading-snug">{d.recommendedFix}</p>
      {d.assignedTrainers.length > 0 && (
        <p className="mt-0.5 text-[11px] text-amber-700/70 dark:text-amber-200/70">
          Assigned:{" "}
          {d.assignedTrainers.map((t) => `${t.name} (${t.hoursPerWeek.toString()}h/wk)`).join(", ")}
        </p>
      )}
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
    case "trainer_blocked":
      return "anchor conflict";
    case "room_busy_or_window":
      return "room / window";
  }
}
