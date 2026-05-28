"use client";

import { useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { Calendar, dateFnsLocalizer, type Event } from "react-big-calendar";
import withDragAndDrop, {
  type EventInteractionArgs,
} from "react-big-calendar/lib/addons/dragAndDrop";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { enUS } from "date-fns/locale";
import {
  ArrowDownTrayIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  DocumentArrowDownIcon,
  TableCellsIcon,
  TrashIcon,
} from "@heroicons/react/20/solid";
import GridScheduleView from "./grid-schedule-view";
import SessionPool from "./session-pool";
import { resolveClassColor } from "./class-palette";
import ClassColorLegend from "./class-color-legend";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import type { ImplClass, ImplRoom, ImplSession, ImplTrainer, Implementation } from "@arbor/shared";
import { Badge, Eyebrow } from "@/components/ui";
import { toCalendarLocal, fromCalendarLocal } from "@/lib/timezone";
import {
  clearDraftSessions,
  placeManualSession,
  publishImplementation,
  setSessionStatus,
  unplaceManualSession,
  updateSessionAssignments,
  updateSessionTime,
} from "../../actions";

type Props = {
  implementation: Implementation;
  sessions: ImplSession[];
  classes: ImplClass[];
  trainers: ImplTrainer[];
  rooms: ImplRoom[];
  backHref: string;
  orgTimeZone: string;
  /** Manual-mode validator inputs — passed through to the grid so the pool
   *  drag preview reflects all draft + published sessions client-side. */
  classTrainers?: { impl_class_id: string; impl_trainer_id: string }[];
  pto?: { impl_trainer_id: string; starts_at: string; ends_at: string }[];
};

type Resource = {
  sessionId: string;
  conflictStatus: ImplSession["conflict_status"];
  classId: string;
  trainerId: string | null;
  roomId: string | null;
  tooltip: string;
};

type CalEvent = Omit<Event, "resource"> & {
  resource: Resource;
  resourceId?: string;
};

const locales = { "en-US": enUS };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales,
});
const DnDCalendar = withDragAndDrop<CalEvent>(Calendar);

// Conflict status drives the BORDER. Per-class color drives the FILL.
// Editorial palette: persimmon for partial, red for full.
const CONFLICT_BORDER: Record<ImplSession["conflict_status"], string> = {
  none: "transparent",
  partial: "#c98a3a", // var(--persimmon-deep)
  full: "#b73d3d", // var(--red)
};

function formatLocal(date: Date, tz: string): string {
  return date.toLocaleString("en-US", {
    timeZone: tz,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ScheduleView({
  implementation,
  sessions,
  classes,
  trainers,
  rooms,
  backHref,
  orgTimeZone,
  classTrainers,
  pto,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);

  // Edge-scroll the page during any drag so the user can reach rooms above
  // or below the viewport. Triggered by native dragover events at the window
  // level — fires for both pool drags and placed-session moves. A rAF loop
  // keeps scrolling smoothly even when the cursor is stationary near an edge.
  useEffect(() => {
    const threshold = 96; // px from viewport edge where auto-scroll engages
    const maxSpeed = 22; // px per frame at the very edge
    let rafId: number | null = null;
    let currentDelta = 0;
    function tick() {
      if (currentDelta !== 0) {
        window.scrollBy(0, currentDelta);
        rafId = requestAnimationFrame(tick);
      } else {
        rafId = null;
      }
    }
    function onDragOver(e: DragEvent) {
      const vh = window.innerHeight;
      const y = e.clientY;
      let delta = 0;
      if (y < threshold) {
        delta = -Math.round(maxSpeed * (1 - y / threshold));
      } else if (y > vh - threshold) {
        delta = Math.round(maxSpeed * (1 - (vh - y) / threshold));
      }
      currentDelta = delta;
      if (delta !== 0 && rafId === null) {
        rafId = requestAnimationFrame(tick);
      }
    }
    function stop() {
      currentDelta = 0;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragend", stop);
    window.addEventListener("drop", stop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragend", stop);
      window.removeEventListener("drop", stop);
      stop();
    };
  }, []);

  // Manual mode defaults to the grid because that's where the pool sits;
  // auto mode keeps the calendar default behavior.
  const [viewMode, setViewMode] = useState<"calendar" | "grid">(
    implementation.schedule_mode === "manual" ? "grid" : "calendar",
  );
  const showPool = implementation.schedule_mode === "manual" && viewMode === "grid";

  // Optimistic layer over the server's sessions array. Drag-drop applies a
  // move synchronously here so the event renders at its drop point in the
  // same frame; React reconciles back to `sessions` automatically when the
  // surrounding transition completes — successful saves land on the new time
  // (router.refresh brings matching sessions in), failed saves snap back.
  const [optimisticSessions, applyOptimisticMove] = useOptimistic(
    sessions,
    (state, move: { id: string; start: string; end: string }) =>
      state.map((s) =>
        s.id === move.id ? { ...s, scheduled_start: move.start, scheduled_end: move.end } : s,
      ),
  );

  const [trainerFilter, setTrainerFilter] = useState<string>("all");
  const [roomFilter, setRoomFilter] = useState<string>("all");
  const [classFilter, setClassFilter] = useState<string>("all");

  const classMap = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const trainerMap = useMemo(() => new Map(trainers.map((t) => [t.id, t])), [trainers]);
  const roomMap = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);

  const filtered = useMemo(() => {
    return optimisticSessions.filter((s) => {
      if (s.status === "cancelled") return false;
      if (trainerFilter !== "all" && s.impl_trainer_id !== trainerFilter) return false;
      if (roomFilter !== "all" && s.impl_room_id !== roomFilter) return false;
      if (classFilter !== "all" && s.impl_class_id !== classFilter) return false;
      return true;
    });
  }, [optimisticSessions, trainerFilter, roomFilter, classFilter]);

  const events = useMemo<CalEvent[]>(() => {
    return filtered.map((s) => {
      const klass = classMap.get(s.impl_class_id);
      const trainer = s.impl_trainer_id ? trainerMap.get(s.impl_trainer_id) : null;
      const room = s.impl_room_id ? roomMap.get(s.impl_room_id) : null;
      const start = toCalendarLocal(s.scheduled_start, orgTimeZone);
      const end = toCalendarLocal(s.scheduled_end, orgTimeZone);
      const realStart = new Date(s.scheduled_start);
      const realEnd = new Date(s.scheduled_end);
      const title = klass?.name ?? "—";
      const tooltip = [
        klass?.name ?? "—",
        `${formatLocal(realStart, orgTimeZone)} – ${formatLocal(realEnd, orgTimeZone)} (${orgTimeZone})`,
        trainer ? `Trainer: ${trainer.name}` : "No trainer",
        room ? `Room: ${room.name} (${room.seat_capacity.toString()} seats)` : "No room",
        `${s.learners_count.toString()} learners · ${s.status}`,
        s.conflict_status !== "none" && s.conflict_reason ? `⚠ ${s.conflict_reason}` : null,
      ]
        .filter((x): x is string => !!x)
        .join("\n");
      return {
        title,
        start,
        end,
        resource: {
          sessionId: s.id,
          conflictStatus: s.conflict_status,
          classId: s.impl_class_id,
          trainerId: s.impl_trainer_id,
          roomId: s.impl_room_id,
          tooltip,
        },
      };
    });
  }, [filtered, classMap, trainerMap, roomMap, orgTimeZone]);

  function handleUnplaceFromPool(sessionId: string) {
    startTransition(async () => {
      const r = await unplaceManualSession(sessionId, implementation.id);
      if (r.ok) toast.success("Session returned to pool");
      else toast.error(r.error.message);
    });
  }

  function handlePlaceFromPool(args: {
    classId: string;
    roomId: string;
    startLocalDate: string;
    startLocalHour: number;
  }) {
    startTransition(async () => {
      const r = await placeManualSession({
        implementationId: implementation.id,
        ...args,
      });
      if (r.ok) toast.success("Session placed");
      else toast.error(r.error.message);
    });
  }

  function handleGridMove(args: {
    sessionId: string;
    newRoomId: string;
    newStartIso: string;
    newEndIso: string;
  }) {
    const target = optimisticSessions.find((s) => s.id === args.sessionId);
    if (!target) return;
    const roomChanged = target.impl_room_id !== args.newRoomId;
    const timeChanged =
      target.scheduled_start !== args.newStartIso || target.scheduled_end !== args.newEndIso;
    if (!roomChanged && !timeChanged) return;
    startTransition(async () => {
      applyOptimisticMove({
        id: args.sessionId,
        start: args.newStartIso,
        end: args.newEndIso,
      });
      const timeOk = !timeChanged
        ? { ok: true as const }
        : await updateSessionTime(
            args.sessionId,
            implementation.id,
            args.newStartIso,
            args.newEndIso,
          );
      if (!timeOk.ok) {
        toast.error(timeOk.error.message);
        return;
      }
      const roomOk = !roomChanged
        ? { ok: true as const }
        : await updateSessionAssignments(args.sessionId, implementation.id, {
            impl_room_id: args.newRoomId,
          });
      if (!roomOk.ok) {
        toast.error(roomOk.error.message);
        return;
      }
      toast.success(roomChanged ? "Session moved to new room" : "Session moved");
    });
  }

  function handleEventDrop(args: EventInteractionArgs<CalEvent>) {
    const { event, start, end } = args;
    const startLocal = start instanceof Date ? start : new Date(start);
    const endLocal = end instanceof Date ? end : new Date(end);
    // The calendar hands us fake-local Dates (org-tz wall clock pretending
    // to be browser-local). Convert back to real UTC before saving.
    const startIso = fromCalendarLocal(startLocal, orgTimeZone);
    const endIso = fromCalendarLocal(endLocal, orgTimeZone);
    const sessionId = event.resource.sessionId;
    startTransition(async () => {
      // Apply optimistic move inside the transition; useOptimistic auto-
      // reverts if the transition completes without a matching base-state
      // change (i.e., on server failure / no router.refresh).
      applyOptimisticMove({ id: sessionId, start: startIso, end: endIso });
      const result = await updateSessionTime(sessionId, implementation.id, startIso, endIso);
      if (result.ok) toast.success("Session moved");
      else toast.error(result.error.message);
    });
  }

  const conflictCounts = useMemo(() => {
    let none = 0,
      partial = 0,
      full = 0;
    for (const s of filtered) {
      if (s.conflict_status === "none") none++;
      else if (s.conflict_status === "partial") partial++;
      else full++;
    }
    return { none, partial, full };
  }, [filtered]);

  const draftCount = sessions.filter((s) => s.status === "draft").length;
  const publishedCount = sessions.filter((s) => s.status === "published").length;

  function handlePublish() {
    if (
      !confirm(
        `Publish ${draftCount.toString()} draft sessions? Trainers will see them in their workload and (per-org config) be notified by email.`,
      )
    )
      return;
    startTransition(async () => {
      const result = await publishImplementation(implementation.id);
      if (result.ok) toast.success(`Published ${result.data.count.toString()} sessions`);
      else toast.error(result.error.message);
    });
  }

  function handleClearDrafts() {
    if (
      !confirm(
        `Delete all ${draftCount.toString()} draft sessions? Published sessions stay. This can't be undone — you'll need to regenerate or place them again manually.`,
      )
    )
      return;
    startTransition(async () => {
      const result = await clearDraftSessions(implementation.id);
      if (result.ok) toast.success(`Cleared ${result.data.count.toString()} draft sessions`);
      else toast.error(result.error.message);
    });
  }

  const openSession = openSessionId ? (sessions.find((s) => s.id === openSessionId) ?? null) : null;

  return (
    <div className="space-y-3">
      {/* Class color legend — collapsible; lets the user re-skin any class */}
      <ClassColorLegend implementationId={implementation.id} classes={classes} />

      {/* Filters + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <Filter
            label="Trainer"
            value={trainerFilter}
            onChange={setTrainerFilter}
            options={[
              { value: "all", label: "All trainers" },
              ...trainers.map((t) => ({ value: t.id, label: t.name })),
            ]}
          />
          <Filter
            label="Room"
            value={roomFilter}
            onChange={setRoomFilter}
            options={[
              { value: "all", label: "All rooms" },
              ...rooms.map((r) => ({ value: r.id, label: r.name })),
            ]}
          />
          <Filter
            label="Class"
            value={classFilter}
            onChange={setClassFilter}
            options={[
              { value: "all", label: "All classes" },
              ...classes.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="border-border bg-background flex overflow-hidden rounded-md border">
            <button
              type="button"
              onClick={() => {
                setViewMode("calendar");
              }}
              className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium ${
                viewMode === "calendar"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-surface"
              }`}
            >
              <CalendarDaysIcon className="h-3.5 w-3.5" />
              Calendar
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode("grid");
              }}
              className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium ${
                viewMode === "grid"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-surface"
              }`}
            >
              <TableCellsIcon className="h-3.5 w-3.5" />
              Grid
            </button>
          </div>
          <Badge variant="success">No conflict · {conflictCounts.none.toString()}</Badge>
          <Badge variant="warning">Partial · {conflictCounts.partial.toString()}</Badge>
          <Badge variant="danger">Full · {conflictCounts.full.toString()}</Badge>
        </div>
      </div>

      {/* Exports + publish */}
      <div className="border-border bg-background flex flex-wrap items-center justify-between gap-2 rounded-xl border p-4">
        <p className="text-muted-foreground font-mono text-[10.5px] uppercase tracking-[0.04em]">
          <b className="text-foreground font-medium normal-case tabular-nums">{sessions.length}</b>{" "}
          total ·{" "}
          <b className="text-foreground font-medium normal-case tabular-nums">{draftCount}</b> draft
          · <b className="text-foreground font-medium normal-case tabular-nums">{publishedCount}</b>{" "}
          published
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/api/training-planner/${implementation.id}/schedule.xlsx`}
            className="border-border bg-background text-foreground hover:bg-surface inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium"
          >
            <ArrowDownTrayIcon className="h-3.5 w-3.5" />
            Excel
          </a>
          <a
            href={`/api/training-planner/${implementation.id}/schedule.pdf`}
            className="border-border bg-background text-foreground hover:bg-surface inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium"
          >
            <DocumentArrowDownIcon className="h-3.5 w-3.5" />
            PDF
          </a>
          <a
            href={`/api/training-planner/${implementation.id}/schedule.ics`}
            className="border-border bg-background text-foreground hover:bg-surface inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium"
          >
            <CalendarDaysIcon className="h-3.5 w-3.5" />
            iCal
          </a>
          <button
            type="button"
            disabled={pending || draftCount === 0}
            onClick={handleClearDrafts}
            className="border-border bg-background text-foreground inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50 dark:hover:bg-rose-950/30 dark:hover:text-rose-200"
            title="Delete every draft session. Published sessions stay."
          >
            <TrashIcon className="h-3.5 w-3.5" />
            Clear drafts
          </button>
          <button
            type="button"
            disabled={pending || draftCount === 0}
            onClick={handlePublish}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            <CheckCircleIcon className="h-3.5 w-3.5" />
            Publish drafts
          </button>
        </div>
      </div>

      {viewMode === "grid" ? (
        showPool ? (
          <div className="flex items-start gap-3">
            <SessionPool
              classes={classes}
              sessions={optimisticSessions}
              onUnplaceSession={handleUnplaceFromPool}
            />
            <div className="min-w-0 flex-1">
              <GridScheduleView
                implementation={implementation}
                sessions={filtered}
                classes={classes}
                trainers={trainers}
                rooms={rooms}
                orgTimeZone={orgTimeZone}
                onOpenSession={setOpenSessionId}
                onMoveSession={handleGridMove}
                onPlaceFromPool={handlePlaceFromPool}
                classTrainers={classTrainers ?? []}
                pto={pto ?? []}
              />
            </div>
          </div>
        ) : (
          <GridScheduleView
            implementation={implementation}
            sessions={filtered}
            classes={classes}
            trainers={trainers}
            rooms={rooms}
            orgTimeZone={orgTimeZone}
            onOpenSession={setOpenSessionId}
            onMoveSession={handleGridMove}
          />
        )
      ) : (
        <>
          {/* Calendar */}
          <div
            className="border-border bg-background rounded-xl border p-4"
            style={{ height: 700 }}
          >
            <DnDCalendar
              localizer={localizer}
              events={events}
              startAccessor="start"
              endAccessor="end"
              views={["month", "week", "day", "agenda"]}
              defaultView="day"
              defaultDate={
                implementation.window_start_date
                  ? new Date(implementation.window_start_date + "T00:00:00")
                  : new Date()
              }
              tooltipAccessor={(event: CalEvent) => event.resource.tooltip}
              min={new Date(0, 0, 0, 7, 0, 0)}
              max={new Date(0, 0, 0, 20, 0, 0)}
              onSelectEvent={(event) => {
                setOpenSessionId(event.resource.sessionId);
              }}
              onEventDrop={handleEventDrop}
              onEventResize={handleEventDrop}
              eventPropGetter={(event: CalEvent) => {
                const klass = classMap.get(event.resource.classId);
                const fill = resolveClassColor(event.resource.classId, klass?.color ?? null);
                const borderColor = CONFLICT_BORDER[event.resource.conflictStatus];
                const hasBorder = event.resource.conflictStatus !== "none";
                return {
                  style: {
                    backgroundColor: fill,
                    borderLeft: hasBorder ? `4px solid ${borderColor}` : "none",
                    borderTop: hasBorder ? `1px solid ${borderColor}` : "none",
                    borderRight: hasBorder ? `1px solid ${borderColor}` : "none",
                    borderBottom: hasBorder ? `1px solid ${borderColor}` : "none",
                    color: "#0f172a",
                  },
                };
              }}
              style={{ height: "100%" }}
            />
          </div>
          <p className="text-muted-foreground font-mono text-[10.5px] uppercase tracking-[0.04em]">
            Times shown in <b className="text-foreground font-medium normal-case">{orgTimeZone}</b>{" "}
            · drag any session to move · click for details
          </p>
        </>
      )}

      <div className="border-border flex items-center justify-between border-t pt-4">
        <a
          href={backHref}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          ← Back
        </a>
      </div>

      {openSession && (
        <SessionDrawer
          implementationId={implementation.id}
          session={openSession}
          klass={classMap.get(openSession.impl_class_id) ?? null}
          trainers={trainers}
          rooms={rooms}
          orgTimeZone={orgTimeZone}
          onClose={() => {
            setOpenSessionId(null);
          }}
        />
      )}
    </div>
  );
}

function Filter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Eyebrow variant="section">{label}</Eyebrow>
      <select
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        className="border-input bg-background text-foreground rounded-md border px-2 py-1.5 text-xs"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── Session drawer (swap trainer / room / cancel) ──────────────────────────

function SessionDrawer({
  implementationId,
  session,
  klass,
  trainers,
  rooms,
  orgTimeZone,
  onClose,
}: {
  implementationId: string;
  session: ImplSession;
  klass: ImplClass | null;
  trainers: ImplTrainer[];
  rooms: ImplRoom[];
  orgTimeZone: string;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function patch(p: { impl_trainer_id?: string | null; impl_room_id?: string | null }) {
    startTransition(async () => {
      const result = await updateSessionAssignments(session.id, implementationId, p);
      if (!result.ok) toast.error(result.error.message);
    });
  }

  function cancel() {
    if (!confirm("Cancel this session? It will stay on file but won't roll up to workload."))
      return;
    startTransition(async () => {
      const result = await setSessionStatus(session.id, implementationId, "cancelled");
      if (result.ok) {
        toast.success("Session cancelled");
        onClose();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="border-border bg-background flex w-full max-w-md flex-col border-l shadow-xl"
        onClick={(e) => {
          e.stopPropagation();
        }}
        role="dialog"
        aria-modal="true"
      >
        <div className="border-border flex items-start justify-between border-b px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-foreground truncate text-base font-semibold">
              {klass?.name ?? "Session"}
            </h2>
            <p className="text-muted-foreground mt-0.5 text-xs tabular-nums">
              {formatLocal(new Date(session.scheduled_start), orgTimeZone)} →{" "}
              {formatLocal(new Date(session.scheduled_end), orgTimeZone)}{" "}
              <span className="text-[10px] font-normal opacity-70">({orgTimeZone})</span>
            </p>
            <p className="text-muted-foreground text-xs capitalize">
              {session.status} · {session.conflict_status} conflict ·{" "}
              {session.learners_count.toString()} learners
            </p>
            {session.conflict_status !== "none" && session.conflict_reason && (
              <p
                className={`mt-1 text-xs ${
                  session.conflict_status === "full"
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-amber-600 dark:text-amber-400"
                }`}
              >
                {session.conflict_reason}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted-foreground hover:text-foreground text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div>
            <p className="text-muted-foreground mb-1 text-xs font-medium uppercase">Trainer</p>
            <select
              value={session.impl_trainer_id ?? ""}
              disabled={pending}
              onChange={(e) => {
                patch({ impl_trainer_id: e.target.value || null });
              }}
              className="border-input bg-background text-foreground w-full rounded-md border px-3 py-1.5 text-sm"
            >
              <option value="">— Unassigned —</option>
              {trainers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="text-muted-foreground mb-1 text-xs font-medium uppercase">Room</p>
            <select
              value={session.impl_room_id ?? ""}
              disabled={pending}
              onChange={(e) => {
                patch({ impl_room_id: e.target.value || null });
              }}
              className="border-input bg-background text-foreground w-full rounded-md border px-3 py-1.5 text-sm"
            >
              <option value="">— Unassigned —</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.seat_capacity.toString()} seats)
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            disabled={pending}
            onClick={cancel}
            className="text-destructive text-xs hover:underline disabled:opacity-50"
          >
            Cancel session
          </button>
        </div>
      </div>
    </div>
  );
}
