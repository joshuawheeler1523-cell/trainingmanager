"use client";

import Link from "next/link";
import { useOptimistic, useTransition, startTransition as _st } from "react";
import { toast } from "sonner";
import { SparklesIcon, Squares2X2Icon } from "@heroicons/react/20/solid";
import GenerateButton from "./generate-button";
import { setScheduleMode } from "../../actions";

type Mode = "auto" | "manual";

type Props = {
  implementationId: string;
  initialMode: Mode;
  ready: boolean;
  existingSessions: number;
};

// Owns the build-mode toggle + the CTA card underneath it. Auto-generate
// surfaces the existing GenerateButton (CSP solver). Manual placement sends
// the user to the schedule grid where they drag class blocks onto cells.
export default function BuildModeSection({
  implementationId,
  initialMode,
  ready,
  existingSessions,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useOptimistic(initialMode, (_state, next: Mode) => next);

  function selectMode(next: Mode) {
    if (next === mode) return;
    startTransition(async () => {
      _st(() => {
        setMode(next);
      });
      const r = await setScheduleMode(implementationId, next);
      if (!r.ok) toast.error(r.error.message);
    });
  }

  return (
    <div className="space-y-3">
      <ModeToggle mode={mode} pending={pending} onChange={selectMode} />
      {mode === "auto" ? (
        <GenerateButton
          implementationId={implementationId}
          ready={ready}
          existingSessions={existingSessions}
        />
      ) : (
        <ManualBuilderCta
          implementationId={implementationId}
          ready={ready}
          existingSessions={existingSessions}
        />
      )}
    </div>
  );
}

function ModeToggle({
  mode,
  pending,
  onChange,
}: {
  mode: Mode;
  pending: boolean;
  onChange: (m: Mode) => void;
}) {
  return (
    <div className="border-border bg-background rounded-lg border p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-foreground text-sm font-semibold">Build mode</p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Let the solver place every session, or build the schedule by hand on the grid.
          </p>
        </div>
        <div
          className="border-border bg-surface inline-flex shrink-0 overflow-hidden rounded-md border"
          role="radiogroup"
          aria-label="Schedule build mode"
        >
          <PillButton
            active={mode === "auto"}
            disabled={pending}
            onClick={() => {
              onChange("auto");
            }}
            label="Auto-generate"
            description="CSP solver places everything"
            icon={<SparklesIcon className="h-3.5 w-3.5" />}
          />
          <PillButton
            active={mode === "manual"}
            disabled={pending}
            onClick={() => {
              onChange("manual");
            }}
            label="Manual placement"
            description="Drag class blocks onto the grid"
            icon={<Squares2X2Icon className="h-3.5 w-3.5" />}
          />
        </div>
      </div>
    </div>
  );
}

function PillButton({
  active,
  disabled,
  onClick,
  label,
  description,
  icon,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  label: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      onClick={onClick}
      title={description}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-background hover:text-foreground"
      } disabled:opacity-50`}
    >
      {icon}
      {label}
    </button>
  );
}

function ManualBuilderCta({
  implementationId,
  ready,
  existingSessions,
}: {
  implementationId: string;
  ready: boolean;
  existingSessions: number;
}) {
  return (
    <div className="border-border bg-background space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-foreground text-sm font-semibold">Manual builder</p>
          <p className="text-muted-foreground text-xs">
            {existingSessions > 0
              ? `${existingSessions.toString()} session${existingSessions === 1 ? "" : "s"} already on the grid. Open the builder to keep placing.`
              : "Open the grid view and drag class blocks from the pool onto rooms and times."}
          </p>
        </div>
        <Link
          href={`/training-planner/${implementationId}/schedule`}
          aria-disabled={!ready}
          tabIndex={ready ? 0 : -1}
          className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium ${
            ready
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-surface text-muted-foreground pointer-events-none cursor-not-allowed"
          }`}
        >
          <Squares2X2Icon className="h-4 w-4" />
          Open manual builder
        </Link>
      </div>
      <p className="text-muted-foreground text-[11px] leading-snug">
        The feasibility check above stays useful — it tells you whether your roster and rooms can
        cover the workload before you start placing.
      </p>
    </div>
  );
}
