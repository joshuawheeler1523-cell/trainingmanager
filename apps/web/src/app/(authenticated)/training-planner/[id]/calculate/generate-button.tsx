"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ExclamationTriangleIcon,
  LockClosedIcon,
  SparklesIcon,
  XCircleIcon,
} from "@heroicons/react/20/solid";
import { generateSchedule, type ScheduleGenResult } from "../../actions";

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

          {result.capacity_gaps.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/30">
              <div className="flex items-start gap-2">
                <ExclamationTriangleIcon className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="text-xs text-amber-900 dark:text-amber-200">
                  <p className="font-semibold">
                    {aborted ? "Why it couldn't fit" : "Capacity gaps"}
                  </p>
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
                  {result.recommendations && Object.keys(result.recommendations).length > 0 && (
                    <div className="mt-2">
                      <p className="font-semibold">To close the gap, pick one:</p>
                      <ul className="mt-1 space-y-0.5">
                        {result.recommendations.trainers_to_add != null &&
                          result.recommendations.trainers_to_add > 0 && (
                            <li>
                              • Add{" "}
                              <span className="font-medium tabular-nums">
                                {result.recommendations.trainers_to_add.toString()}
                              </span>{" "}
                              more trainer
                              {result.recommendations.trainers_to_add === 1 ? "" : "s"}.
                            </li>
                          )}
                        {result.recommendations.trainer_hours_per_week_to_add != null &&
                          result.recommendations.trainer_hours_per_week_to_add > 0 && (
                            <li>
                              • Add{" "}
                              <span className="font-medium tabular-nums">
                                {result.recommendations.trainer_hours_per_week_to_add.toString()}{" "}
                                h/wk
                              </span>{" "}
                              of trainer capacity across the team.
                            </li>
                          )}
                        {result.recommendations.weeks_to_extend != null &&
                          result.recommendations.weeks_to_extend > 0 && (
                            <li>
                              • Extend the window by{" "}
                              <span className="font-medium tabular-nums">
                                {result.recommendations.weeks_to_extend.toString()} week
                                {result.recommendations.weeks_to_extend === 1 ? "" : "s"}
                              </span>
                              .
                            </li>
                          )}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
