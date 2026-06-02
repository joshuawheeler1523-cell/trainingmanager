"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ExclamationTriangleIcon, LightBulbIcon, SparklesIcon } from "@heroicons/react/20/solid";
import { generateSchedule, type ScheduleGenResult } from "../../actions";
import type { ClassDiagnosis, SolverStrategy } from "@/lib/training-planner/schedule-solver";

type Props = {
  implementationId: string;
  ready: boolean;
  existingSessions: number;
};

const STRATEGIES: { value: SolverStrategy; label: string; description: string }[] = [
  {
    value: "balanced",
    label: "Balanced",
    description: "Spread each class evenly across the window (recommended)",
  },
  {
    value: "fastest",
    label: "Fastest finish",
    description: "Pack sessions into the earliest open slots — shortest end date",
  },
  {
    value: "morning",
    label: "Morning priority",
    description: "Prefer earlier wall-clock times each day",
  },
  {
    value: "evening",
    label: "Evening priority",
    description: "Prefer later wall-clock times each day",
  },
  {
    value: "spread",
    label: "Spread out",
    description: "Maximize gaps between every session across all classes",
  },
];

export default function GenerateButton({ implementationId, ready, existingSessions }: Props) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ScheduleGenResult | null>(null);
  const [strategy, setStrategy] = useState<SolverStrategy>("balanced");

  function handleGenerate() {
    if (!ready) return;
    if (existingSessions > 0) {
      if (
        !confirm(
          `Regenerating will delete the existing ${existingSessions.toString()} draft sessions and re-run the scheduler. Published sessions are preserved. Continue?`,
        )
      ) {
        return;
      }
    }
    startTransition(async () => {
      const r = await generateSchedule(implementationId, strategy);
      if (r.ok) {
        setResult(r.data);
        if (r.data.conflicts > 0) {
          toast.error(
            `Generated ${r.data.sessions.toString()} sessions — ${r.data.conflicts.toString()} have capacity gaps`,
          );
        } else {
          toast.success(`Generated ${r.data.sessions.toString()} sessions, no conflicts`);
        }
      } else {
        toast.error(r.error.message);
      }
    });
  }

  const selected = STRATEGIES.find((s) => s.value === strategy) ?? STRATEGIES[0];

  return (
    <div className="border-border bg-background space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-foreground text-sm font-semibold">Generate schedule</p>
          <p className="text-muted-foreground text-xs">
            {existingSessions > 0
              ? `Currently ${existingSessions.toString()} sessions exist. Regenerating wipes drafts and re-runs the scheduler.`
              : "Run the scheduler to place sessions on the calendar."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5">
            <span className="text-muted-foreground text-[10px] font-medium uppercase tracking-wide">
              Strategy
            </span>
            <select
              value={strategy}
              onChange={(e) => {
                setStrategy(e.target.value as SolverStrategy);
              }}
              disabled={pending}
              className="border-input bg-background text-foreground rounded-md border px-2 py-1.5 text-xs"
            >
              {STRATEGIES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={pending || !ready}
            onClick={handleGenerate}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            <SparklesIcon className="h-4 w-4" />
            {pending ? "Generating…" : "Generate schedule"}
          </button>
        </div>
      </div>
      {selected && (
        <p className="text-muted-foreground text-[11px] leading-snug">
          <span className="text-foreground font-medium">{selected.label}:</span>{" "}
          {selected.description}
        </p>
      )}

      {result && (
        <div className="border-border space-y-2 rounded-md border-t pt-3">
          <p className="text-foreground text-sm">
            <span className="font-semibold tabular-nums">{result.sessions.toString()}</span>{" "}
            sessions created ·{" "}
            <span
              className={
                result.conflicts > 0
                  ? "text-destructive font-semibold tabular-nums"
                  : "text-success font-semibold tabular-nums"
              }
            >
              {result.conflicts.toString()}
            </span>{" "}
            with capacity gaps
          </p>

          {result.capacity_gaps.length > 0 && <DiagnosisPanel result={result} />}
        </div>
      )}
    </div>
  );
}

function DiagnosisPanel({ result }: { result: ScheduleGenResult }) {
  const diagnoses = result.diagnoses;
  const headline = result.headline_fix;
  const hasRichDiagnosis = diagnoses.length > 0;

  return (
    <div className="space-y-2">
      {hasRichDiagnosis && headline && (
        <div className="border-success-bd bg-success-bg rounded-md border p-3">
          <div className="flex items-start gap-2">
            <LightBulbIcon className="text-success mt-0.5 h-4 w-4 shrink-0" />
            <div className="text-success text-xs">
              <p className="font-semibold">Biggest unlock</p>
              <p className="mt-0.5">
                {headline.recommendedFix}{" "}
                <span className="text-success/80">
                  Would place {headline.sessionsUnblocked.toString()} of{" "}
                  {result.capacity_gaps.length.toString()} unscheduled sessions.
                </span>
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="border-warning-bd bg-warning-bg rounded-md border p-3">
        <div className="flex items-start gap-2">
          <ExclamationTriangleIcon className="text-warning mt-0.5 h-4 w-4 shrink-0" />
          <div className="text-warning w-full text-xs">
            <p className="font-semibold">Capacity gaps</p>
            {hasRichDiagnosis ? (
              <ul className="mt-1.5 space-y-2">
                {diagnoses.map((d) => (
                  <DiagnosisRow key={d.classId} d={d} />
                ))}
              </ul>
            ) : (
              <ul className="mt-1 space-y-0.5">
                {result.capacity_gaps.slice(0, 10).map((g, i) => (
                  <li key={i}>
                    <span className="font-medium">{g.class_name}</span> · session{" "}
                    {g.session_index.toString()} — {g.reason}
                  </li>
                ))}
                {result.capacity_gaps.length > 10 && (
                  <li className="italic">…{(result.capacity_gaps.length - 10).toString()} more</li>
                )}
              </ul>
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
        <span className="text-warning/80 tabular-nums">
          {d.unplacedSessions.toString()} session{d.unplacedSessions === 1 ? "" : "s"} short
        </span>
        <span className="text-warning/70 text-[10px] uppercase tracking-wide">
          {bottleneckLabel(d.bottleneck)}
        </span>
      </div>
      <p className="mt-0.5 leading-snug">{d.recommendedFix}</p>
      {d.assignedTrainers.length > 0 && (
        <p className="text-warning/70 mt-0.5 text-[11px]">
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
    case "room_busy_or_window":
      return "room / window";
  }
}
