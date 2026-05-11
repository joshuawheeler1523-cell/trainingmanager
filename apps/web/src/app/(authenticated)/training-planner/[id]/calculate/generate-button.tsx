"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExclamationTriangleIcon, SparklesIcon } from "@heroicons/react/20/solid";
import { generateSchedule, type ScheduleGenResult } from "../../actions";

type Props = {
  implementationId: string;
  ready: boolean;
  existingSessions: number;
};

export default function GenerateButton({ implementationId, ready, existingSessions }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ScheduleGenResult | null>(null);

  function handleGenerate() {
    if (!ready) return;
    if (
      existingSessions > 0 &&
      !confirm(
        `Regenerating will delete the existing ${existingSessions.toString()} draft sessions and re-run the scheduler. Published sessions are preserved. Continue?`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const r = await generateSchedule(implementationId);
      if (r.ok) {
        setResult(r.data);
        if (r.data.conflicts > 0) {
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

  return (
    <div className="border-border bg-background space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-foreground text-sm font-semibold">Generate schedule</p>
          <p className="text-muted-foreground text-xs">
            {existingSessions > 0
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
          <SparklesIcon className="h-4 w-4" />
          {pending ? "Generating…" : "Generate Schedule"}
        </button>
      </div>

      {result && (
        <div className="border-border space-y-2 rounded-md border-t pt-3">
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
          </p>

          {result.capacity_gaps.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/30">
              <div className="flex items-start gap-2">
                <ExclamationTriangleIcon className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="text-xs text-amber-900 dark:text-amber-200">
                  <p className="font-semibold">Capacity gaps</p>
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
