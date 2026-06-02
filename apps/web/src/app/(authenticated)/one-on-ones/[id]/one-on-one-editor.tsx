"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  PlusIcon,
  TrashIcon,
  XCircleIcon,
} from "@heroicons/react/20/solid";
import {
  ONE_ON_ONE_TOPIC_CODES,
  ONE_ON_ONE_TOPIC_LABELS,
  ONE_ON_ONE_CONCERN_CODES,
  ONE_ON_ONE_CONCERN_LABELS,
  ONE_ON_ONE_SENTIMENTS,
  ONE_ON_ONE_SENTIMENT_LABELS,
  ONE_ON_ONE_ITEM_CATEGORIES,
  ONE_ON_ONE_ITEM_CATEGORY_LABELS,
  ONE_ON_ONE_ITEM_OWNERS,
  ONE_ON_ONE_CHANGE_RATIONALES,
  ONE_ON_ONE_CHANGE_RATIONALE_LABELS,
  type Instructor,
  type OneOnOne,
  type OneOnOneActionItem,
  type OneOnOneChangeRationale,
  type OneOnOneConcern,
  type OneOnOneItemCategory,
  type OneOnOneItemOwner,
  type OneOnOneSentiment,
  type OneOnOneTopic,
  type OneOnOneWorkloadChange,
} from "@arbor/shared";
import {
  completeOneOnOne,
  createActionItem,
  deleteActionItem,
  markAdHocTaskDone,
  removeRecurringAssignment,
  resolveActionItem,
  setClassAssignment,
  updateActionItem,
  updateOneOnOne,
} from "../actions";
import { Badge, Eyebrow } from "@/components/ui";

type WorkloadRow = {
  source: string;
  source_id: string;
  source_label: string;
  annual_hours: number | string;
  quantity: number | null;
  bucket_id: string | null;
};

type Props = {
  session: OneOnOne;
  instructor: Instructor;
  capacity: { annual_hours: number; assigned_hours: number; utilization_pct: number } | null;
  workloadRows: WorkloadRow[];
  priorSessions: Array<{
    id: string;
    scheduled_for: string;
    snapshot_total_hours: number | null;
    snapshot_utilization_pct: number | null;
    completed_at: string | null;
  }>;
  carriedOverItems: OneOnOneActionItem[];
  thisActionItems: OneOnOneActionItem[];
  workloadChanges: OneOnOneWorkloadChange[];
  classAssignments: Array<{ id: string; class_id: string; assigned_offerings: number }>;
  recurringAssignments: Array<{
    recurring_task_id: string;
    instructor_id: string;
  }>;
  adHocTasks: Array<{
    id: string;
    name: string;
    hours: number;
    status: string;
    bucket_id: string | null;
  }>;
  classes: Array<{ id: string; name: string }>;
  recurringTasks: Array<{ id: string; name: string }>;
  buckets: Array<{ id: string; name: string }>;
  individualAllocations: Array<{ id: string; bucket_id: string; target_percent: number }>;
};

const fieldClass =
  "border-input bg-background text-foreground rounded-md border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

function utilizationBand(pct: number): { color: string; bg: string; label: string } {
  if (pct >= 95) return { color: "text-danger", bg: "bg-danger", label: "over-allocated" };
  if (pct >= 80) return { color: "text-warning", bg: "bg-warning", label: "at risk" };
  if (pct >= 40) return { color: "text-success", bg: "bg-success", label: "balanced" };
  return { color: "text-slate-600", bg: "bg-slate-400", label: "under-utilized" };
}

export default function OneOnOneEditor({
  session,
  instructor,
  capacity,
  workloadRows,
  priorSessions,
  carriedOverItems,
  thisActionItems: initialItems,
  workloadChanges,
  classAssignments,
  recurringAssignments,
  adHocTasks,
  classes,
  recurringTasks,
  buckets,
  individualAllocations,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const completed = session.completed_at !== null;

  const lastCompleted = priorSessions.find((p) => p.completed_at !== null);
  const utilDelta =
    capacity?.utilization_pct != null && lastCompleted?.snapshot_utilization_pct != null
      ? capacity.utilization_pct - lastCompleted.snapshot_utilization_pct
      : null;

  const band = capacity ? utilizationBand(capacity.utilization_pct) : null;
  const utilPctRounded = capacity ? Math.round(capacity.utilization_pct) : null;

  function patch(values: {
    sentiment?: OneOnOneSentiment | null;
    topics?: OneOnOneTopic[];
    concerns?: OneOnOneConcern[];
  }) {
    if (completed) return;
    startTransition(async () => {
      // Sentiment/topics/concerns live in the form's own state, so we don't
      // need a router.refresh to see the new value. Skipping it makes the
      // click feel instant instead of waiting on the 14-query page reload.
      const result = await updateOneOnOne(session.id, values);
      if (!result.ok) toast.error(result.error.message);
    });
  }

  function handleComplete() {
    if (!confirm("Mark this 1:1 complete? The capacity snapshot will be re-captured.")) return;
    startTransition(async () => {
      const result = await completeOneOnOne(session.id);
      if (result.ok) toast.success("1:1 complete");
      else toast.error(result.error.message);
    });
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Link
            href="/one-on-ones"
            className="text-muted-foreground hover:text-foreground mb-2 inline-flex items-center gap-1 text-xs"
          >
            <ArrowLeftIcon className="h-3.5 w-3.5" />
            All 1:1s
          </Link>
          <Eyebrow className="mb-2">1:1 conversation</Eyebrow>
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className="font-display text-foreground text-2xl font-medium leading-tight tracking-[-0.005em]">
              {instructor.full_name}
            </h1>
            <Badge variant={completed ? "success" : "warning"}>
              {completed ? "Complete" : "In progress"}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-2 font-mono text-[10.5px] uppercase tracking-[0.04em]">
            {completed ? "Completed · " : "Started · "}
            <span className="normal-case tabular-nums">
              {new Date(session.scheduled_for).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </span>
            {completed && session.completed_at && (
              <>
                {" "}
                · closed{" "}
                <span className="normal-case tabular-nums">
                  {new Date(session.completed_at).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
              </>
            )}
          </p>
        </div>
        {!completed && (
          <button
            type="button"
            disabled={pending}
            onClick={handleComplete}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            <CheckCircleIcon className="h-4 w-4" />
            Mark complete
          </button>
        )}
      </div>

      {/* Capacity snapshot */}
      <div className="border-border bg-background rounded-xl border p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <Eyebrow variant="mute" className="mb-1.5">
              Capacity at start
            </Eyebrow>
            <p className="font-display text-foreground text-3xl font-medium tabular-nums leading-none tracking-[-0.01em]">
              {utilPctRounded != null ? `${utilPctRounded.toString()}%` : "—"}
              {band && (
                <span
                  className={`ml-2 font-mono text-[10.5px] font-medium uppercase tracking-[0.04em] ${band.color}`}
                >
                  {band.label}
                </span>
              )}
            </p>
          </div>
          <p className="text-muted-foreground font-mono text-[10.5px] uppercase tracking-[0.04em]">
            {capacity ? (
              <>
                <b className="text-foreground font-medium normal-case tabular-nums">
                  {Math.round(capacity.assigned_hours).toString()} /{" "}
                  {capacity.annual_hours.toString()} h
                </b>
              </>
            ) : (
              ""
            )}
          </p>
        </div>
        {capacity && band && (
          <div className="bg-surface mt-3 h-2 w-full overflow-hidden rounded-full">
            <div
              className={`h-full ${band.bg}`}
              style={{ width: `${Math.min(100, capacity.utilization_pct).toString()}%` }}
            />
          </div>
        )}
        {lastCompleted && utilDelta != null && (
          <p className="text-muted-foreground mt-2 text-xs">
            Last 1:1:{" "}
            {new Date(lastCompleted.scheduled_for).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}{" "}
            · was {Math.round(lastCompleted.snapshot_utilization_pct ?? 0).toString()}% (
            <span
              className={
                utilDelta > 0
                  ? "text-danger"
                  : utilDelta < 0
                    ? "text-success"
                    : "text-muted-foreground"
              }
            >
              {utilDelta > 0 ? "+" : ""}
              {Math.round(utilDelta).toString()} pts
            </span>
            )
          </p>
        )}
        {priorSessions.length > 0 && (
          <TrendSparkline current={capacity?.utilization_pct ?? null} prior={priorSessions} />
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* LEFT: workload */}
        <WorkloadColumn
          oneOnOneId={session.id}
          instructorId={instructor.id}
          completed={completed}
          pending={pending}
          workloadRows={workloadRows}
          classAssignments={classAssignments}
          recurringAssignments={recurringAssignments}
          adHocTasks={adHocTasks}
          classes={classes}
          recurringTasks={recurringTasks}
          buckets={buckets}
          individualAllocations={individualAllocations}
          onAfterMutate={() => {
            // Refresh after each workload edit so the capacity card and
            // utilization % up top reflect the change immediately. The
            // workload views (v_instructor_capacity, v_instructor_workload)
            // recompute on every read, so this is the only piece needed
            // for "edits adjust allocation percentages automatically."
            // Each row's input keeps its own local state, so the refresh
            // doesn't disrupt in-progress typing in other rows.
            router.refresh();
          }}
        />

        {/* RIGHT: conversation */}
        <ConversationColumn
          session={session}
          completed={completed}
          pending={pending}
          carriedOverItems={carriedOverItems}
          thisActionItems={initialItems}
          onPatchSession={patch}
          onAfterMutate={() => {
            router.refresh();
          }}
        />
      </div>

      {workloadChanges.length > 0 && <ChangeLogPanel changes={workloadChanges} />}
    </div>
  );
}

// ── Capacity trend (last N completed snapshots) ────────────────────────────

function TrendSparkline({
  current,
  prior,
}: {
  current: number | null;
  prior: Array<{ snapshot_utilization_pct: number | null }>;
}) {
  const values = [
    ...prior
      .slice()
      .reverse()
      .map((p) => p.snapshot_utilization_pct)
      .filter((v): v is number => v != null),
    ...(current != null ? [current] : []),
  ];
  if (values.length < 2) return null;
  const max = Math.max(100, ...values);
  const min = Math.min(0, ...values);
  const range = max - min || 1;
  const w = 240;
  const h = 32;
  const step = w / (values.length - 1);
  const path = values
    .map((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / range) * h;
      return `${i === 0 ? "M" : "L"}${x.toString()},${y.toString()}`;
    })
    .join(" ");

  return (
    <div className="mt-3 flex items-center gap-3">
      <p className="text-muted-foreground text-[10px] uppercase tracking-wide">
        Utilization, last {values.length.toString()}
      </p>
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w.toString()} ${h.toString()}`}
        role="img"
        aria-label="Capacity trend"
      >
        <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

// ── Workload column ────────────────────────────────────────────────────────

function WorkloadColumn({
  oneOnOneId,
  instructorId,
  completed,
  pending,
  workloadRows,
  classAssignments,
  recurringAssignments,
  adHocTasks,
  classes,
  recurringTasks,
  buckets,
  individualAllocations,
  onAfterMutate,
}: {
  oneOnOneId: string;
  instructorId: string;
  completed: boolean;
  pending: boolean;
  workloadRows: WorkloadRow[];
  classAssignments: Array<{ id: string; class_id: string; assigned_offerings: number }>;
  recurringAssignments: Array<{
    recurring_task_id: string;
    instructor_id: string;
  }>;
  adHocTasks: Array<{
    id: string;
    name: string;
    hours: number;
    status: string;
    bucket_id: string | null;
  }>;
  classes: Array<{ id: string; name: string }>;
  recurringTasks: Array<{ id: string; name: string }>;
  buckets: Array<{ id: string; name: string }>;
  individualAllocations: Array<{ id: string; bucket_id: string; target_percent: number }>;
  onAfterMutate: () => void;
}) {
  const classNameById = new Map(classes.map((c) => [c.id, c.name]));
  const recurringNameById = new Map(recurringTasks.map((r) => [r.id, r.name]));
  const bucketNameById = new Map(buckets.map((b) => [b.id, b.name]));

  const classHoursById = useMemo(() => {
    // Map class_id → hours per workload row (already aggregated by source).
    const map = new Map<string, number>();
    for (const r of workloadRows) {
      if (r.source === "class") map.set(r.source_id, Number(r.annual_hours));
    }
    return map;
  }, [workloadRows]);

  const recurringHoursById = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of workloadRows) {
      if (r.source === "recurring_task") map.set(r.source_id, Number(r.annual_hours));
    }
    return map;
  }, [workloadRows]);

  return (
    <div className="space-y-3">
      <div className="border-border bg-background rounded-lg border p-3">
        <Eyebrow>Classes</Eyebrow>
        {classAssignments.length === 0 ? (
          <p className="text-muted-foreground mt-1 text-xs italic">No class assignments.</p>
        ) : (
          <ul className="divide-border mt-1 divide-y">
            {classAssignments.map((a) => {
              const hours = Math.round(classHoursById.get(a.class_id) ?? 0);
              return (
                <ClassAssignmentRow
                  key={a.id}
                  oneOnOneId={oneOnOneId}
                  classId={a.class_id}
                  instructorId={instructorId}
                  className={classNameById.get(a.class_id) ?? "—"}
                  assignedOfferings={a.assigned_offerings}
                  annualHours={hours}
                  disabled={completed || pending}
                  onAfterMutate={onAfterMutate}
                />
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-border bg-background rounded-lg border p-3">
        <Eyebrow>Recurring tasks</Eyebrow>
        {recurringAssignments.length === 0 ? (
          <p className="text-muted-foreground mt-1 text-xs italic">No recurring assignments.</p>
        ) : (
          <ul className="divide-border mt-1 divide-y">
            {recurringAssignments.map((a) => {
              const hours = Math.round(recurringHoursById.get(a.recurring_task_id) ?? 0);
              return (
                <RecurringAssignmentRow
                  key={a.recurring_task_id}
                  oneOnOneId={oneOnOneId}
                  recurringTaskId={a.recurring_task_id}
                  instructorId={a.instructor_id}
                  taskName={recurringNameById.get(a.recurring_task_id) ?? "—"}
                  annualHours={hours}
                  disabled={completed || pending}
                  onAfterMutate={onAfterMutate}
                />
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-border bg-background rounded-lg border p-3">
        <Eyebrow>Ad-hoc tasks (open)</Eyebrow>
        {adHocTasks.length === 0 ? (
          <p className="text-muted-foreground mt-1 text-xs italic">No open ad-hoc tasks.</p>
        ) : (
          <ul className="divide-border mt-1 divide-y">
            {adHocTasks.map((t) => (
              <AdHocTaskRow
                key={t.id}
                oneOnOneId={oneOnOneId}
                taskId={t.id}
                name={t.name}
                hours={t.hours}
                status={t.status}
                disabled={completed || pending}
                onAfterMutate={onAfterMutate}
              />
            ))}
          </ul>
        )}
      </div>

      <ReadOnlyWorkloadSection
        title="Education requests"
        rows={workloadRows.filter((r) => r.source === "education_request")}
        emptyMessage="No assigned education requests."
        manageHref="/request-queue"
        manageLabel="Manage in Request Queue →"
      />

      <ReadOnlyWorkloadSection
        title="Projects & training implementations"
        rows={workloadRows.filter((r) => r.source === "project_task")}
        emptyMessage="No active project tasks or training-planner sessions."
        manageHref="/projects"
        manageLabel="Manage in Projects / Training Planner →"
      />

      {individualAllocations.length > 0 && (
        <div className="border-border bg-background rounded-lg border p-3">
          <Eyebrow>Allocation targets</Eyebrow>
          <ul className="divide-border mt-1 divide-y">
            {individualAllocations.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-1.5 text-xs">
                <span className="text-foreground">{bucketNameById.get(a.bucket_id) ?? "—"}</span>
                <span className="text-muted-foreground tabular-nums">
                  Target {Math.round(a.target_percent).toString()}%
                </span>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground mt-2 text-[11px]">
            <Link href="/allocations" className="underline">
              Edit allocation targets in Allocations →
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}

function ClassAssignmentRow({
  oneOnOneId,
  classId,
  instructorId,
  className: name,
  assignedOfferings,
  annualHours,
  disabled,
  onAfterMutate,
}: {
  oneOnOneId: string;
  classId: string;
  instructorId: string;
  className: string;
  assignedOfferings: number;
  annualHours: number;
  disabled: boolean;
  onAfterMutate: () => void;
}) {
  const [draft, setDraft] = useState(assignedOfferings.toString());
  const [pending, startTransition] = useTransition();
  const [rationale, setRationale] = useState<OneOnOneChangeRationale | "">("");

  function commit(newVal: number) {
    if (newVal === assignedOfferings) return;
    startTransition(async () => {
      const result = await setClassAssignment(
        oneOnOneId,
        classId,
        instructorId,
        newVal,
        rationale || null,
      );
      if (!result.ok) toast.error(result.error.message);
      else {
        toast.success("Updated");
        onAfterMutate();
      }
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-2 py-1.5 text-xs">
      <span className="text-foreground flex-1 truncate">{name}</span>
      <input
        type="number"
        min={0}
        value={draft}
        disabled={disabled || pending}
        onChange={(e) => {
          setDraft(e.target.value);
        }}
        onBlur={() => {
          const n = Number(draft);
          if (Number.isFinite(n) && n >= 0) commit(n);
          else setDraft(assignedOfferings.toString());
        }}
        className={fieldClass + " w-16 tabular-nums"}
      />
      <select
        value={rationale}
        onChange={(e) => {
          setRationale(e.target.value as OneOnOneChangeRationale | "");
        }}
        disabled={disabled || pending}
        className={fieldClass + " w-32 text-[11px]"}
      >
        <option value="">Reason…</option>
        {ONE_ON_ONE_CHANGE_RATIONALES.map((r) => (
          <option key={r} value={r}>
            {ONE_ON_ONE_CHANGE_RATIONALE_LABELS[r]}
          </option>
        ))}
      </select>
      <span className="text-muted-foreground w-16 text-right tabular-nums">{annualHours}h</span>
    </li>
  );
}

// Read-only fold-down for workload sources the 1:1 tool can't edit
// in-place (education_request, project_task / impl_sessions). The hours
// already roll into the capacity card at the top; this surfaces the line
// items so the planner can talk about them during the meeting.
function ReadOnlyWorkloadSection({
  title,
  rows,
  emptyMessage,
  manageHref,
  manageLabel,
}: {
  title: string;
  rows: WorkloadRow[];
  emptyMessage: string;
  manageHref: string;
  manageLabel: string;
}) {
  const total = rows.reduce((sum, r) => sum + Number(r.annual_hours), 0);
  return (
    <div className="border-border bg-background rounded-lg border p-3">
      <div className="flex items-baseline justify-between">
        <Eyebrow>{title}</Eyebrow>
        {rows.length > 0 && (
          <span className="text-muted-foreground text-xs tabular-nums">
            {Math.round(total).toString()}h · {rows.length.toString()}{" "}
            {rows.length === 1 ? "item" : "items"}
          </span>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-muted-foreground mt-1 text-xs italic">{emptyMessage}</p>
      ) : (
        <ul className="divide-border mt-1 divide-y">
          {rows.map((r) => (
            <li
              key={`${r.source}-${r.source_id}`}
              className="flex items-center gap-2 py-1.5 text-xs"
            >
              <span className="text-foreground flex-1 truncate">{r.source_label}</span>
              <span className="text-muted-foreground w-16 text-right tabular-nums">
                {Math.round(Number(r.annual_hours)).toString()}h
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-muted-foreground mt-2 text-[11px]">
        <Link href={manageHref} className="underline">
          {manageLabel}
        </Link>
      </p>
    </div>
  );
}

function RecurringAssignmentRow({
  oneOnOneId,
  recurringTaskId,
  instructorId,
  taskName,
  annualHours,
  disabled,
  onAfterMutate,
}: {
  oneOnOneId: string;
  recurringTaskId: string;
  instructorId: string;
  taskName: string;
  annualHours: number;
  disabled: boolean;
  onAfterMutate: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [rationale, setRationale] = useState<OneOnOneChangeRationale | "">("");

  function handleRemove() {
    startTransition(async () => {
      const result = await removeRecurringAssignment(
        oneOnOneId,
        recurringTaskId,
        instructorId,
        rationale || null,
      );
      if (!result.ok) toast.error(result.error.message);
      else {
        toast.success("Removed from task");
        onAfterMutate();
      }
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-2 py-1.5 text-xs">
      <span className="text-foreground flex-1 truncate">{taskName}</span>
      <select
        value={rationale}
        onChange={(e) => {
          setRationale(e.target.value as OneOnOneChangeRationale | "");
        }}
        disabled={disabled || pending}
        className={fieldClass + " w-32 text-[11px]"}
      >
        <option value="">Reason…</option>
        {ONE_ON_ONE_CHANGE_RATIONALES.map((r) => (
          <option key={r} value={r}>
            {ONE_ON_ONE_CHANGE_RATIONALE_LABELS[r]}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={handleRemove}
        disabled={disabled || pending}
        className="text-muted-foreground hover:text-destructive text-[11px] underline disabled:opacity-50"
      >
        Remove
      </button>
      <span className="text-muted-foreground w-16 text-right tabular-nums">{annualHours}h</span>
    </li>
  );
}

function AdHocTaskRow({
  oneOnOneId,
  taskId,
  name,
  hours,
  status,
  disabled,
  onAfterMutate,
}: {
  oneOnOneId: string;
  taskId: string;
  name: string;
  hours: number;
  status: string;
  disabled: boolean;
  onAfterMutate: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [rationale, setRationale] = useState<OneOnOneChangeRationale | "">("task_complete");

  function handleDone() {
    startTransition(async () => {
      const result = await markAdHocTaskDone(oneOnOneId, taskId, rationale || null);
      if (!result.ok) toast.error(result.error.message);
      else {
        toast.success("Marked done");
        onAfterMutate();
      }
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-2 py-1.5 text-xs">
      <span className="text-foreground flex-1 truncate">
        {name} <span className="text-muted-foreground capitalize">({status})</span>
      </span>
      <select
        value={rationale}
        onChange={(e) => {
          setRationale(e.target.value as OneOnOneChangeRationale | "");
        }}
        disabled={disabled || pending}
        className={fieldClass + " w-32 text-[11px]"}
      >
        {ONE_ON_ONE_CHANGE_RATIONALES.map((r) => (
          <option key={r} value={r}>
            {ONE_ON_ONE_CHANGE_RATIONALE_LABELS[r]}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={disabled || pending}
        onClick={handleDone}
        className="border-border bg-background hover:bg-surface inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium disabled:opacity-50"
      >
        Mark done
      </button>
      <span className="text-muted-foreground w-16 text-right tabular-nums">{hours}h</span>
    </li>
  );
}

// ── Conversation column ────────────────────────────────────────────────────

function ConversationColumn({
  session,
  completed,
  pending,
  carriedOverItems,
  thisActionItems,
  onPatchSession,
  onAfterMutate,
}: {
  session: OneOnOne;
  completed: boolean;
  pending: boolean;
  carriedOverItems: OneOnOneActionItem[];
  thisActionItems: OneOnOneActionItem[];
  onPatchSession: (v: {
    sentiment?: OneOnOneSentiment | null;
    topics?: OneOnOneTopic[];
    concerns?: OneOnOneConcern[];
  }) => void;
  onAfterMutate: () => void;
}) {
  const topics = new Set(session.topics);
  const concerns = new Set(session.concerns);

  function toggleTopic(t: OneOnOneTopic) {
    const next = new Set(topics);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    onPatchSession({ topics: Array.from(next) });
  }
  function toggleConcern(c: OneOnOneConcern) {
    const next = new Set(concerns);
    if (next.has(c)) next.delete(c);
    else next.add(c);
    onPatchSession({ concerns: Array.from(next) });
  }

  return (
    <div className="space-y-3">
      {/* Sentiment */}
      <div className="border-border bg-background rounded-lg border p-3">
        <Eyebrow>Overall sentiment</Eyebrow>
        <div className="mt-2 flex flex-wrap gap-1">
          {ONE_ON_ONE_SENTIMENTS.map((s) => {
            const active = session.sentiment === s;
            return (
              <button
                key={s}
                type="button"
                disabled={completed || pending}
                onClick={() => {
                  onPatchSession({ sentiment: active ? null : s });
                }}
                className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background hover:bg-surface text-foreground"
                }`}
              >
                {ONE_ON_ONE_SENTIMENT_LABELS[s]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Topics */}
      <div className="border-border bg-background rounded-lg border p-3">
        <Eyebrow>Topics discussed</Eyebrow>
        <p className="text-muted-foreground text-[11px]">Pick all that apply.</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {ONE_ON_ONE_TOPIC_CODES.map((t) => {
            const active = topics.has(t);
            return (
              <button
                key={t}
                type="button"
                disabled={completed || pending}
                onClick={() => {
                  toggleTopic(t);
                }}
                className={`rounded-full border px-2.5 py-0.5 text-[11px] disabled:opacity-50 ${
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-input text-muted-foreground hover:bg-surface"
                }`}
              >
                {ONE_ON_ONE_TOPIC_LABELS[t]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Concerns */}
      <div className="border-border bg-background rounded-lg border p-3">
        <Eyebrow>Concerns flagged</Eyebrow>
        <div className="mt-2 flex flex-wrap gap-1">
          {ONE_ON_ONE_CONCERN_CODES.map((c) => {
            const active = concerns.has(c);
            return (
              <button
                key={c}
                type="button"
                disabled={completed || pending}
                onClick={() => {
                  toggleConcern(c);
                }}
                className={`rounded-full border px-2.5 py-0.5 text-[11px] disabled:opacity-50 ${
                  active
                    ? "border-danger-bd bg-danger-bg text-danger"
                    : "border-input text-muted-foreground hover:bg-surface"
                }`}
              >
                {ONE_ON_ONE_CONCERN_LABELS[c]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Carry-over action items */}
      {carriedOverItems.length > 0 && (
        <div className="border-border bg-background rounded-lg border p-3">
          <Eyebrow>From last 1:1 ({carriedOverItems.length.toString()})</Eyebrow>
          <ul className="divide-border mt-1 divide-y">
            {carriedOverItems.map((item) => (
              <CarriedItemRow
                key={item.id}
                item={item}
                oneOnOneId={session.id}
                disabled={completed || pending}
                onAfterMutate={onAfterMutate}
              />
            ))}
          </ul>
        </div>
      )}

      {/* New action items */}
      <div className="border-border bg-background rounded-lg border p-3">
        <Eyebrow>Action items for next time</Eyebrow>
        <ul className="divide-border mt-1 divide-y">
          {thisActionItems.map((item) => (
            <ThisItemRow
              key={item.id}
              item={item}
              oneOnOneId={session.id}
              disabled={completed || pending}
              onAfterMutate={onAfterMutate}
            />
          ))}
        </ul>
        {!completed && (
          <NewItemRow oneOnOneId={session.id} disabled={pending} onAfterMutate={onAfterMutate} />
        )}
      </div>
    </div>
  );
}

function CarriedItemRow({
  item,
  oneOnOneId,
  disabled,
  onAfterMutate,
}: {
  item: OneOnOneActionItem;
  oneOnOneId: string;
  disabled: boolean;
  onAfterMutate: () => void;
}) {
  const [pending, startTransition] = useTransition();
  function resolve(status: "done" | "cancelled") {
    startTransition(async () => {
      const result = await resolveActionItem(item.id, oneOnOneId, status);
      if (!result.ok) toast.error(result.error.message);
      else {
        toast.success(status === "done" ? "Marked done" : "Cancelled");
        onAfterMutate();
      }
    });
  }
  return (
    <li className="flex flex-wrap items-start gap-2 py-1.5 text-xs">
      <div className="flex-1">
        <p className="text-foreground">{item.description}</p>
        <p className="text-muted-foreground mt-0.5 text-[11px]">
          {item.category.replace(/_/g, " ")} · owner: {item.owner}
          {item.due_by && ` · due ${item.due_by}`}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Mark done"
          title="Mark done"
          disabled={disabled || pending}
          onClick={() => {
            resolve("done");
          }}
          className="text-muted-foreground hover:text-success rounded p-1 disabled:opacity-50"
        >
          <CheckCircleIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Cancel"
          title="Cancel"
          disabled={disabled || pending}
          onClick={() => {
            resolve("cancelled");
          }}
          className="text-muted-foreground hover:text-destructive rounded p-1 disabled:opacity-50"
        >
          <XCircleIcon className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}

function ThisItemRow({
  item,
  oneOnOneId,
  disabled,
  onAfterMutate,
}: {
  item: OneOnOneActionItem;
  oneOnOneId: string;
  disabled: boolean;
  onAfterMutate: () => void;
}) {
  const [pending, startTransition] = useTransition();
  function handleDelete() {
    startTransition(async () => {
      const result = await deleteActionItem(item.id, oneOnOneId);
      if (!result.ok) toast.error(result.error.message);
      else onAfterMutate();
    });
  }
  function patchStatus(status: OneOnOneActionItem["status"]) {
    startTransition(async () => {
      const result = await updateActionItem(item.id, oneOnOneId, { status });
      if (!result.ok) toast.error(result.error.message);
      else onAfterMutate();
    });
  }
  return (
    <li className="flex flex-wrap items-start gap-2 py-1.5 text-xs">
      <div className="flex-1">
        <p className="text-foreground">{item.description}</p>
        <p className="text-muted-foreground mt-0.5 text-[11px]">
          {item.category.replace(/_/g, " ")} · owner: {item.owner}
          {item.due_by && ` · due ${item.due_by}`}
        </p>
      </div>
      <select
        value={item.status}
        onChange={(e) => {
          patchStatus(e.target.value as OneOnOneActionItem["status"]);
        }}
        disabled={disabled || pending}
        className={fieldClass + " w-28 text-[11px]"}
      >
        <option value="open">Open</option>
        <option value="in_progress">In progress</option>
        <option value="done">Done</option>
        <option value="cancelled">Cancelled</option>
      </select>
      <button
        type="button"
        disabled={disabled || pending}
        onClick={handleDelete}
        aria-label="Delete"
        className="text-muted-foreground hover:text-destructive rounded p-1 disabled:opacity-50"
      >
        <TrashIcon className="h-4 w-4" />
      </button>
    </li>
  );
}

function NewItemRow({
  oneOnOneId,
  disabled,
  onAfterMutate,
}: {
  oneOnOneId: string;
  disabled: boolean;
  onAfterMutate: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<OneOnOneItemCategory>("other_operational");
  const [owner, setOwner] = useState<OneOnOneItemOwner>("instructor");
  const [dueBy, setDueBy] = useState("");

  function handleAdd() {
    const trimmed = description.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const result = await createActionItem(oneOnOneId, {
        description: trimmed,
        category,
        owner,
        due_by: dueBy || null,
      });
      if (result.ok) {
        setDescription("");
        setDueBy("");
        onAfterMutate();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <div className="border-border mt-2 grid grid-cols-1 gap-2 border-t pt-2 md:grid-cols-[1fr_140px_110px_120px_auto]">
      <input
        value={description}
        onChange={(e) => {
          setDescription(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleAdd();
          }
        }}
        maxLength={140}
        placeholder="Operational item only — no patient identifiers"
        disabled={disabled || pending}
        className={fieldClass + " w-full"}
      />
      <select
        value={category}
        onChange={(e) => {
          setCategory(e.target.value as OneOnOneItemCategory);
        }}
        disabled={disabled || pending}
        className={fieldClass + " w-full text-[11px]"}
      >
        {ONE_ON_ONE_ITEM_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {ONE_ON_ONE_ITEM_CATEGORY_LABELS[c]}
          </option>
        ))}
      </select>
      <select
        value={owner}
        onChange={(e) => {
          setOwner(e.target.value as OneOnOneItemOwner);
        }}
        disabled={disabled || pending}
        className={fieldClass + " w-full text-[11px]"}
      >
        {ONE_ON_ONE_ITEM_OWNERS.map((o) => (
          <option key={o} value={o} className="capitalize">
            {o}
          </option>
        ))}
      </select>
      <input
        type="date"
        value={dueBy}
        onChange={(e) => {
          setDueBy(e.target.value);
        }}
        disabled={disabled || pending}
        className={fieldClass + " w-full text-[11px] tabular-nums"}
      />
      <button
        type="button"
        disabled={disabled || pending || !description.trim()}
        onClick={handleAdd}
        className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50"
      >
        <PlusIcon className="h-3.5 w-3.5" />
        Add
      </button>
    </div>
  );
}

// ── Reconcile change log ───────────────────────────────────────────────────

function ChangeLogPanel({ changes }: { changes: OneOnOneWorkloadChange[] }) {
  return (
    <div className="border-border bg-background rounded-lg border p-3">
      <Eyebrow>Reconcile log ({changes.length.toString()})</Eyebrow>
      <p className="text-muted-foreground text-[11px]">Every workload edit made during this 1:1.</p>
      <ul className="divide-border mt-2 divide-y">
        {changes.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2 py-1.5 text-xs">
            <span className="text-foreground capitalize">
              {c.source_kind.replace(/_/g, " ")} · {c.change_kind}
            </span>
            <span className="text-muted-foreground flex-1 tabular-nums">{summarizeChange(c)}</span>
            {c.rationale_category && (
              <span className="text-muted-foreground bg-surface rounded-full px-2 py-0.5 text-[10px] capitalize">
                {c.rationale_category.replace(/_/g, " ")}
              </span>
            )}
            <span className="text-muted-foreground text-[10px] tabular-nums">
              {new Date(c.created_at).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function summarizeChange(c: OneOnOneWorkloadChange): string {
  if (c.change_kind === "removed") return "removed";
  if (c.change_kind === "added") return "added";
  const before = c.before_value ?? {};
  const after = c.after_value ?? {};
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  return keys
    .map((k) => {
      const a = before[k];
      const b = after[k];
      return `${k}: ${String(a)} → ${String(b)}`;
    })
    .join(" · ");
}
