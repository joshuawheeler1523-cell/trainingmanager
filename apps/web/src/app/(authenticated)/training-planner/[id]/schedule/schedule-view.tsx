"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
} from "@heroicons/react/20/solid";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import type { ImplClass, ImplRoom, ImplSession, ImplTrainer, Implementation } from "@arbor/shared";
import {
  publishImplementation,
  setSessionStatus,
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
};

type Resource = {
  sessionId: string;
  conflictStatus: ImplSession["conflict_status"];
  classId: string;
  trainerId: string | null;
  roomId: string | null;
};

type CalEvent = Omit<Event, "resource"> & {
  resource: Resource;
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

const CONFLICT_COLORS: Record<ImplSession["conflict_status"], string> = {
  none: "#34d399", // emerald
  partial: "#fbbf24", // amber
  full: "#f87171", // red
};

export default function ScheduleView({
  implementation,
  sessions,
  classes,
  trainers,
  rooms,
  backHref,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);

  const [trainerFilter, setTrainerFilter] = useState<string>("all");
  const [roomFilter, setRoomFilter] = useState<string>("all");
  const [classFilter, setClassFilter] = useState<string>("all");

  const classMap = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const trainerMap = useMemo(() => new Map(trainers.map((t) => [t.id, t])), [trainers]);
  const roomMap = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);

  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      if (s.status === "cancelled") return false;
      if (trainerFilter !== "all" && s.impl_trainer_id !== trainerFilter) return false;
      if (roomFilter !== "all" && s.impl_room_id !== roomFilter) return false;
      if (classFilter !== "all" && s.impl_class_id !== classFilter) return false;
      return true;
    });
  }, [sessions, trainerFilter, roomFilter, classFilter]);

  const events = useMemo<CalEvent[]>(() => {
    return filtered.map((s) => {
      const klass = classMap.get(s.impl_class_id);
      const trainer = s.impl_trainer_id ? trainerMap.get(s.impl_trainer_id) : null;
      const room = s.impl_room_id ? roomMap.get(s.impl_room_id) : null;
      const title = [
        klass?.name ?? "—",
        trainer?.name ?? "no trainer",
        room?.name ?? "no room",
      ].join(" · ");
      return {
        title,
        start: new Date(s.scheduled_start),
        end: new Date(s.scheduled_end),
        resource: {
          sessionId: s.id,
          conflictStatus: s.conflict_status,
          classId: s.impl_class_id,
          trainerId: s.impl_trainer_id,
          roomId: s.impl_room_id,
        },
      };
    });
  }, [filtered, classMap, trainerMap, roomMap]);

  function handleEventDrop(args: EventInteractionArgs<CalEvent>) {
    const { event, start, end } = args;
    const startDate = start instanceof Date ? start : new Date(start);
    const endDate = end instanceof Date ? end : new Date(end);
    const oldStart = event.start;
    const titleText = typeof event.title === "string" ? event.title : "session";
    const ok = confirm(
      `Move "${titleText}" from ${oldStart?.toLocaleString() ?? "?"} to ${startDate.toLocaleString()}? This may create conflicts.`,
    );
    if (!ok) return;
    startTransition(async () => {
      const result = await updateSessionTime(
        event.resource.sessionId,
        implementation.id,
        startDate.toISOString(),
        endDate.toISOString(),
      );
      if (result.ok) {
        toast.success("Session moved");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
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
      if (result.ok) {
        toast.success(`Published ${result.data.count.toString()} sessions`);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  const openSession = openSessionId ? (sessions.find((s) => s.id === openSessionId) ?? null) : null;

  return (
    <div className="space-y-3">
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
          <Pill color="emerald">No conflict: {conflictCounts.none.toString()}</Pill>
          <Pill color="amber">Partial: {conflictCounts.partial.toString()}</Pill>
          <Pill color="rose">Full: {conflictCounts.full.toString()}</Pill>
        </div>
      </div>

      {/* Exports + publish */}
      <div className="border-border bg-background flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
        <p className="text-muted-foreground text-xs">
          {sessions.length.toString()} total · {draftCount.toString()} draft ·{" "}
          {publishedCount.toString()} published
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/api/training-planner/${implementation.id}/schedule.xlsx`}
            className="border-input bg-background text-foreground hover:bg-surface inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium"
          >
            <ArrowDownTrayIcon className="h-3.5 w-3.5" />
            Excel
          </a>
          <a
            href={`/api/training-planner/${implementation.id}/schedule.pdf`}
            className="border-input bg-background text-foreground hover:bg-surface inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium"
          >
            <DocumentArrowDownIcon className="h-3.5 w-3.5" />
            PDF
          </a>
          <a
            href={`/api/training-planner/${implementation.id}/schedule.ics`}
            className="border-input bg-background text-foreground hover:bg-surface inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium"
          >
            <CalendarDaysIcon className="h-3.5 w-3.5" />
            iCal
          </a>
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

      {/* Calendar */}
      <div className="border-border bg-background rounded-lg border p-3" style={{ height: 700 }}>
        <DnDCalendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          views={["month", "week", "day", "agenda"]}
          defaultView="week"
          defaultDate={
            implementation.window_start_date
              ? new Date(implementation.window_start_date + "T00:00:00")
              : new Date()
          }
          onSelectEvent={(event) => {
            setOpenSessionId(event.resource.sessionId);
          }}
          onEventDrop={handleEventDrop}
          onEventResize={handleEventDrop}
          eventPropGetter={(event: CalEvent) => {
            const color = CONFLICT_COLORS[event.resource.conflictStatus];
            return {
              style: {
                backgroundColor: color,
                borderColor: color,
                color: "#0f172a",
              },
            };
          }}
          style={{ height: "100%" }}
        />
      </div>

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
    <div>
      <p className="text-muted-foreground mb-1 text-xs font-medium">{label}</p>
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

function Pill({
  color,
  children,
}: {
  color: "emerald" | "amber" | "rose";
  children: React.ReactNode;
}) {
  const cls = {
    emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
    rose: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200",
  }[color];
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${cls}`}>
      {children}
    </span>
  );
}

// ── Session drawer (swap trainer / room / cancel) ──────────────────────────

function SessionDrawer({
  implementationId,
  session,
  klass,
  trainers,
  rooms,
  onClose,
}: {
  implementationId: string;
  session: ImplSession;
  klass: ImplClass | null;
  trainers: ImplTrainer[];
  rooms: ImplRoom[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function patch(p: { impl_trainer_id?: string | null; impl_room_id?: string | null }) {
    startTransition(async () => {
      const result = await updateSessionAssignments(session.id, implementationId, p);
      if (result.ok) router.refresh();
      else toast.error(result.error.message);
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
        router.refresh();
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
              {new Date(session.scheduled_start).toLocaleString()} →{" "}
              {new Date(session.scheduled_end).toLocaleString()}
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
