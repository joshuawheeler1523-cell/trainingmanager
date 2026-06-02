"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  type Milestone,
  type Project,
  type Task,
  type TaskActionItem,
  type TaskAssignment,
  type TaskDependency,
  type TaskStatus,
} from "@arbor/shared";
import { createTask, updateTask } from "../actions";
import TaskDrawer, { type TeamMemberWithInstructor } from "./task-drawer";

type Props = {
  project: Project;
  tasks: Task[];
  team: TeamMemberWithInstructor[];
  assignments: TaskAssignment[];
  actionItems: TaskActionItem[];
  milestones: Milestone[];
  dependencies: TaskDependency[];
};

type Zoom = "day" | "week" | "month";

const ROW_HEIGHT = 36;
const HEADER_HEIGHT = 40;
const LABEL_WIDTH = 220;
const BAR_HEIGHT = 22;
const BAR_OFFSET = (ROW_HEIGHT - BAR_HEIGHT) / 2;

const PIXELS_PER_DAY: Record<Zoom, number> = { day: 48, week: 14, month: 5 };

// Bar classes use `bg-*` because the rendered bars are <div>s — the
// previous `fill-*` classes silently no-op'd, leaving every status
// looking the same washed-out gray. `ring` is the inset border so the
// bar reads as solid even when overlapping grid lines.
//
// Color intent:
//   not_started → muted slate (visible but quiet, hasn't started yet)
//   in_progress → primary brand color (active work)
//   on_hold     → amber (paused / blocked)
//   completed   → emerald (done)
const STATUS_COLOR: Record<TaskStatus, { bar: string; ring: string; text: string }> = {
  not_started: {
    bar: "bg-slate-200 dark:bg-slate-700",
    ring: "ring-slate-400 dark:ring-slate-500",
    text: "text-slate-900 dark:text-slate-100",
  },
  in_progress: {
    bar: "bg-primary/80",
    ring: "ring-primary",
    text: "text-primary-foreground",
  },
  on_hold: {
    bar: "bg-warning",
    ring: "ring-warning",
    text: "text-warning",
  },
  completed: {
    bar: "bg-success",
    ring: "ring-success",
    text: "text-success",
  },
};

// ── date helpers ────────────────────────────────────────────────────────────

function parseDate(s: string): Date {
  return new Date(s + "T00:00:00Z");
}
function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}
function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}
function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
function endOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

// ── bounds: min and max date across project + tasks + milestones ────────────

function computeBounds(args: { project: Project; tasks: Task[]; milestones: Milestone[] }): {
  rangeStart: Date;
  rangeEnd: Date;
} {
  const dates: Date[] = [];
  if (args.project.start_date) dates.push(parseDate(args.project.start_date));
  if (args.project.end_date) dates.push(parseDate(args.project.end_date));
  for (const t of args.tasks) {
    if (t.start_date) dates.push(parseDate(t.start_date));
    if (t.end_date) dates.push(parseDate(t.end_date));
  }
  for (const m of args.milestones) {
    dates.push(parseDate(m.due_date));
  }
  const today = new Date();
  const first = dates[0];
  if (!first) {
    return { rangeStart: addDays(today, -7), rangeEnd: addDays(today, 60) };
  }
  let min = first;
  let max = first;
  for (const d of dates) {
    if (d < min) min = d;
    if (d > max) max = d;
  }
  // Pad both ends so bars don't sit flush against the edges.
  return { rangeStart: addDays(min, -3), rangeEnd: addDays(max, 7) };
}

// ── header ticks: returns the set of vertical lines + labels for the chosen zoom

function headerTicks(rangeStart: Date, rangeEnd: Date, zoom: Zoom): { x: number; label: string }[] {
  const out: { x: number; label: string }[] = [];
  const ppd = PIXELS_PER_DAY[zoom];
  if (zoom === "day") {
    let d = new Date(rangeStart);
    while (d <= rangeEnd) {
      out.push({
        x: diffDays(d, rangeStart) * ppd,
        label: `${(d.getUTCMonth() + 1).toString()}/${d.getUTCDate().toString()}`,
      });
      d = addDays(d, 1);
    }
  } else if (zoom === "week") {
    // Snap to nearest Monday at or before rangeStart
    const dow = (rangeStart.getUTCDay() + 6) % 7;
    let d = addDays(rangeStart, -dow);
    while (d <= rangeEnd) {
      const x = diffDays(d, rangeStart) * ppd;
      out.push({
        x,
        label: `${(d.getUTCMonth() + 1).toString()}/${d.getUTCDate().toString()}`,
      });
      d = addDays(d, 7);
    }
  } else {
    let d = startOfMonth(rangeStart);
    while (d <= rangeEnd) {
      out.push({
        x: diffDays(d, rangeStart) * ppd,
        label: d.toLocaleString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }),
      });
      d = startOfMonth(addDays(endOfMonth(d), 1));
    }
  }
  return out;
}

// ── component ───────────────────────────────────────────────────────────────

export default function GanttTab({
  project,
  tasks,
  team,
  assignments,
  actionItems,
  milestones,
  dependencies,
}: Props) {
  const [, startTransition] = useTransition();
  const [zoom, setZoom] = useState<Zoom>("week");
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const sorted = useMemo(() => {
    return [...tasks].sort((a, b) => {
      // Tasks without dates fall to the bottom; otherwise sort by start_date.
      if (!a.start_date && !b.start_date) return a.sort_order - b.sort_order;
      if (!a.start_date) return 1;
      if (!b.start_date) return -1;
      return a.start_date.localeCompare(b.start_date);
    });
  }, [tasks]);

  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  const { rangeStart, rangeEnd } = useMemo(
    () => computeBounds({ project, tasks, milestones }),
    [project, tasks, milestones],
  );
  const ppd = PIXELS_PER_DAY[zoom];
  const totalDays = diffDays(rangeEnd, rangeStart);
  const chartWidth = totalDays * ppd;
  const chartHeight = sorted.length * ROW_HEIGHT;
  const ticks = headerTicks(rangeStart, rangeEnd, zoom);

  const today = new Date();
  const todayX = diffDays(today, rangeStart) * ppd;

  function dateAtX(x: number): Date {
    return addDays(rangeStart, Math.round(x / ppd));
  }

  // ── drag state for moving / resizing bars ────────────────────────────────
  const dragRef = useRef<{
    taskId: string;
    mode: "move" | "resize-l" | "resize-r";
    startX: number;
    origStart: Date;
    origEnd: Date;
  } | null>(null);
  const [dragPreview, setDragPreview] = useState<Map<string, { start: Date; end: Date }>>(
    new Map(),
  );

  function handleBarPointerDown(
    e: React.PointerEvent,
    task: Task,
    mode: "move" | "resize-l" | "resize-r",
  ) {
    if (!task.start_date || !task.end_date) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      taskId: task.id,
      mode,
      startX: e.clientX,
      origStart: parseDate(task.start_date),
      origEnd: parseDate(task.end_date),
    };
  }

  function handleBarPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const deltaDays = Math.round((e.clientX - drag.startX) / ppd);
    if (deltaDays === 0) return;
    let nextStart = drag.origStart;
    let nextEnd = drag.origEnd;
    if (drag.mode === "move") {
      nextStart = addDays(drag.origStart, deltaDays);
      nextEnd = addDays(drag.origEnd, deltaDays);
    } else if (drag.mode === "resize-l") {
      nextStart = addDays(drag.origStart, deltaDays);
      if (nextStart > nextEnd) nextStart = nextEnd;
    } else {
      nextEnd = addDays(drag.origEnd, deltaDays);
      if (nextEnd < nextStart) nextEnd = nextStart;
    }
    setDragPreview((prev) => {
      const next = new Map(prev);
      next.set(drag.taskId, { start: nextStart, end: nextEnd });
      return next;
    });
  }

  function handleBarPointerUp(e: React.PointerEvent) {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    const preview = dragPreview.get(drag.taskId);
    setDragPreview(new Map());
    if (!preview) return;
    const start = toIsoDate(preview.start);
    const end = toIsoDate(preview.end);
    const task = taskById.get(drag.taskId);
    if (!task) return;
    if (start === task.start_date && end === task.end_date) return;
    startTransition(async () => {
      const result = await updateTask(drag.taskId, project.id, {
        start_date: start,
        end_date: end,
      });
      if (!result.ok) toast.error(result.error.message);
    });
  }

  // ── drag-to-create on empty area ─────────────────────────────────────────
  const createDragRef = useRef<{ rowIndex: number; startX: number; currentX: number } | null>(null);
  const [createPreview, setCreatePreview] = useState<{ y: number; x: number; w: number } | null>(
    null,
  );

  function handleEmptyPointerDown(e: React.PointerEvent, rowIndex: number) {
    if (e.target !== e.currentTarget) return; // skip if click hit a bar
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    createDragRef.current = { rowIndex, startX: x, currentX: x };
    setCreatePreview({ y: rowIndex * ROW_HEIGHT + BAR_OFFSET, x, w: 0 });
  }

  function handleEmptyPointerMove(e: React.PointerEvent) {
    const drag = createDragRef.current;
    if (!drag) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    drag.currentX = x;
    const left = Math.min(drag.startX, x);
    const w = Math.abs(x - drag.startX);
    setCreatePreview({ y: drag.rowIndex * ROW_HEIGHT + BAR_OFFSET, x: left, w });
  }

  function handleEmptyPointerUp(e: React.PointerEvent) {
    const drag = createDragRef.current;
    createDragRef.current = null;
    setCreatePreview(null);
    if (!drag) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    const left = Math.min(drag.startX, drag.currentX);
    const right = Math.max(drag.startX, drag.currentX);
    if (right - left < 10) return; // ignore tiny drags
    const startDate = toIsoDate(dateAtX(left));
    const endDate = toIsoDate(dateAtX(right));
    startTransition(async () => {
      const result = await createTask(project.id, {
        name: "New task",
        start_date: startDate,
        end_date: endDate,
      });
      if (result.ok) {
        toast.success("Task created — click to rename");
        setOpenTaskId(result.data.id);
      } else {
        toast.error(result.error.message);
      }
    });
  }

  const openTask = openTaskId ? (tasks.find((t) => t.id === openTaskId) ?? null) : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-xs">
          Drag bars to shift dates. Drag the edges to resize. Drag on an empty row to create a task.
        </p>
        <div className="border-input flex overflow-hidden rounded-md border">
          {(["day", "week", "month"] as const).map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => {
                setZoom(z);
              }}
              className={`px-3 py-1 text-xs font-medium capitalize transition-colors ${
                zoom === z
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              {z}
            </button>
          ))}
        </div>
      </div>

      {sorted.length === 0 ? (
        <EmptyHint />
      ) : (
        <div className="border-border overflow-x-auto rounded-lg border">
          <div
            className="relative"
            style={{
              width: LABEL_WIDTH + chartWidth,
              minHeight: HEADER_HEIGHT + chartHeight,
            }}
          >
            {/* Header */}
            <div
              className="border-border bg-surface sticky top-0 z-10 flex border-b"
              style={{ height: HEADER_HEIGHT }}
            >
              <div
                className="border-border text-muted-foreground bg-surface flex shrink-0 items-center border-r px-3 text-xs font-semibold"
                style={{ width: LABEL_WIDTH }}
              >
                Task
              </div>
              <div className="relative flex-1" style={{ width: chartWidth }}>
                {ticks.map((tk, i) => (
                  <div
                    key={i}
                    className="text-muted-foreground absolute top-1/2 -translate-y-1/2 text-xs tabular-nums"
                    style={{ left: tk.x + 4 }}
                  >
                    {tk.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Body */}
            <div className="flex">
              {/* Labels column */}
              <div className="border-border bg-background border-r" style={{ width: LABEL_WIDTH }}>
                {sorted.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setOpenTaskId(t.id);
                    }}
                    className="border-border hover:bg-surface flex w-full items-center border-b px-3 text-left"
                    style={{ height: ROW_HEIGHT }}
                  >
                    <span className="text-foreground line-clamp-1 text-xs">{t.name}</span>
                  </button>
                ))}
              </div>

              {/* Chart area */}
              <div className="relative" style={{ width: chartWidth, height: chartHeight }}>
                {/* Vertical grid lines */}
                <svg
                  className="pointer-events-none absolute inset-0"
                  width={chartWidth}
                  height={chartHeight}
                >
                  {ticks.map((tk, i) => (
                    <line
                      key={i}
                      x1={tk.x}
                      x2={tk.x}
                      y1={0}
                      y2={chartHeight}
                      className="stroke-border"
                      strokeWidth={1}
                    />
                  ))}
                  {/* Today line */}
                  {todayX >= 0 && todayX <= chartWidth && (
                    <line
                      x1={todayX}
                      x2={todayX}
                      y1={0}
                      y2={chartHeight}
                      className="stroke-destructive"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                    />
                  )}
                  {/* Dependencies (curves) */}
                  {dependencies.map((d) => {
                    const pred = taskById.get(d.predecessor_id);
                    const succ = taskById.get(d.successor_id);
                    if (!pred || !succ) return null;
                    if (!pred.end_date || !succ.start_date) return null;
                    const predRow = sorted.findIndex((t) => t.id === pred.id);
                    const succRow = sorted.findIndex((t) => t.id === succ.id);
                    if (predRow < 0 || succRow < 0) return null;
                    const x1 = (diffDays(parseDate(pred.end_date), rangeStart) + 1) * ppd;
                    const y1 = predRow * ROW_HEIGHT + ROW_HEIGHT / 2;
                    const x2 = diffDays(parseDate(succ.start_date), rangeStart) * ppd;
                    const y2 = succRow * ROW_HEIGHT + ROW_HEIGHT / 2;
                    const c = Math.min(40, Math.abs(x2 - x1) / 2 + 8);
                    return (
                      <path
                        key={d.id}
                        d={`M ${x1.toString()} ${y1.toString()} C ${(x1 + c).toString()} ${y1.toString()}, ${(x2 - c).toString()} ${y2.toString()}, ${x2.toString()} ${y2.toString()}`}
                        className="stroke-muted-foreground"
                        strokeWidth={1.5}
                        fill="none"
                        markerEnd="url(#gantt-arrow)"
                      />
                    );
                  })}
                  <defs>
                    <marker
                      id="gantt-arrow"
                      viewBox="0 0 10 10"
                      refX="8"
                      refY="5"
                      markerWidth="6"
                      markerHeight="6"
                      orient="auto"
                    >
                      <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground" />
                    </marker>
                  </defs>
                  {/* Milestone diamonds */}
                  {milestones.map((m) => {
                    const x = (diffDays(parseDate(m.due_date), rangeStart) + 0.5) * ppd;
                    return (
                      <g key={m.id} transform={`translate(${x.toString()}, 8)`}>
                        <polygon
                          points="0,-6 6,0 0,6 -6,0"
                          className={m.is_complete ? "fill-emerald-500" : "fill-amber-500"}
                        >
                          <title>{m.name}</title>
                        </polygon>
                      </g>
                    );
                  })}
                </svg>

                {/* Rows + bars */}
                {sorted.map((t, i) => {
                  const preview = dragPreview.get(t.id);
                  const start = preview?.start ?? (t.start_date ? parseDate(t.start_date) : null);
                  const end = preview?.end ?? (t.end_date ? parseDate(t.end_date) : null);
                  const hasDates = !!start && !!end;
                  const x = start ? diffDays(start, rangeStart) * ppd : 0;
                  const w = start && end ? Math.max(ppd, (diffDays(end, start) + 1) * ppd) : 0;
                  const color = STATUS_COLOR[t.status];
                  return (
                    <div
                      key={t.id}
                      onPointerDown={(e) => {
                        handleEmptyPointerDown(e, i);
                      }}
                      onPointerMove={handleEmptyPointerMove}
                      onPointerUp={handleEmptyPointerUp}
                      className="border-border relative cursor-crosshair border-b"
                      style={{ height: ROW_HEIGHT }}
                    >
                      {hasDates && (
                        <div
                          onPointerDown={(e) => {
                            handleBarPointerDown(e, t, "move");
                          }}
                          onPointerMove={handleBarPointerMove}
                          onPointerUp={handleBarPointerUp}
                          onClick={() => {
                            setOpenTaskId(t.id);
                          }}
                          className={`absolute cursor-grab rounded-md ${color.bar} ${color.ring} ring-1 ring-inset hover:ring-2`}
                          style={{
                            left: x,
                            width: w,
                            top: BAR_OFFSET,
                            height: BAR_HEIGHT,
                          }}
                          title={`${t.name} · ${t.start_date ?? "?"} → ${t.end_date ?? "?"}`}
                        >
                          {/* Resize handles */}
                          <div
                            onPointerDown={(e) => {
                              handleBarPointerDown(e, t, "resize-l");
                            }}
                            onPointerMove={handleBarPointerMove}
                            onPointerUp={handleBarPointerUp}
                            className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize"
                          />
                          <div
                            onPointerDown={(e) => {
                              handleBarPointerDown(e, t, "resize-r");
                            }}
                            onPointerMove={handleBarPointerMove}
                            onPointerUp={handleBarPointerUp}
                            className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize"
                          />
                          {/* Progress fill — darker overlay over the bar's color */}
                          {t.percent_complete > 0 && (
                            <div
                              className="absolute inset-y-0 left-0 rounded-md bg-black/25 dark:bg-white/15"
                              style={{ width: `${t.percent_complete.toString()}%` }}
                            />
                          )}
                          <span
                            className={`relative line-clamp-1 px-2 pt-0.5 text-xs font-medium leading-[22px] ${color.text}`}
                          >
                            {t.name}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Drag-to-create preview */}
                {createPreview && (
                  <div
                    className="border-primary bg-primary/30 pointer-events-none absolute rounded-md border border-dashed"
                    style={{
                      left: createPreview.x,
                      top: createPreview.y,
                      width: createPreview.w,
                      height: BAR_HEIGHT,
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {openTask && (
        <TaskDrawer
          project={project}
          task={openTask}
          allProjectTasks={tasks}
          team={team}
          assignments={assignments.filter((a) => a.task_id === openTask.id)}
          actionItems={actionItems.filter((a) => a.task_id === openTask.id)}
          dependencies={dependencies}
          milestones={milestones}
          onClose={() => {
            setOpenTaskId(null);
          }}
        />
      )}
    </div>
  );
}

function EmptyHint() {
  return (
    <div className="border-border bg-surface rounded-lg border border-dashed p-12 text-center">
      <p className="text-foreground text-sm font-medium">No tasks to chart</p>
      <p className="text-muted-foreground mt-1 text-xs">
        Create tasks with start and end dates to see them on the timeline.
      </p>
    </div>
  );
}
