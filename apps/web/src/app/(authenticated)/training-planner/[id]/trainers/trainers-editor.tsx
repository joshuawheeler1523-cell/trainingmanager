"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CalendarDaysIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/20/solid";
import type { ImplTrainer, ImplTrainerUnavailability, Instructor } from "@arbor/shared";
import {
  addTrainerUnavailability,
  createTrainer,
  deleteTrainer,
  deleteTrainerUnavailability,
  setStep,
  updateTrainer,
} from "../../actions";

type Props = {
  implementationId: string;
  trainers: ImplTrainer[];
  instructors: Instructor[];
  unavailability: ImplTrainerUnavailability[];
};

const fieldClass =
  "border-input bg-background text-foreground rounded-md border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export default function TrainersEditor({
  implementationId,
  trainers,
  instructors,
  unavailability,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const usedInstructorIds = new Set(
    trainers.map((t) => t.instructor_id).filter((x): x is string => !!x),
  );
  const availableInstructors = instructors.filter((i) => !usedInstructorIds.has(i.id));

  const [pickInstructor, setPickInstructor] = useState("");
  const [externalName, setExternalName] = useState("");
  const [externalEmail, setExternalEmail] = useState("");
  const [hours, setHours] = useState("20");
  const [openPtoFor, setOpenPtoFor] = useState<string | null>(null);

  const ptoByTrainer = new Map<string, ImplTrainerUnavailability[]>();
  for (const u of unavailability) {
    const list = ptoByTrainer.get(u.impl_trainer_id) ?? [];
    list.push(u);
    ptoByTrainer.set(u.impl_trainer_id, list);
  }

  function addFromInstructor() {
    if (!pickInstructor) return;
    const inst = instructors.find((i) => i.id === pickInstructor);
    if (!inst) return;
    startTransition(async () => {
      const result = await createTrainer(implementationId, {
        instructor_id: inst.id,
        name: inst.full_name,
        email: inst.email,
        availability_hours_per_week: Number(hours),
      });
      if (result.ok) {
        setPickInstructor("");
        setHours("20");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function addExternal() {
    const name = externalName.trim();
    if (!name) return;
    startTransition(async () => {
      const result = await createTrainer(implementationId, {
        instructor_id: null,
        name,
        email: externalEmail.trim() || null,
        availability_hours_per_week: Number(hours),
      });
      if (result.ok) {
        setExternalName("");
        setExternalEmail("");
        setHours("20");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleUpdate(t: ImplTrainer, patch: Record<string, unknown>) {
    startTransition(async () => {
      const result = await updateTrainer(t.id, implementationId, patch);
      if (result.ok) router.refresh();
      else toast.error(result.error.message);
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteTrainer(id, implementationId);
      if (result.ok) router.refresh();
      else toast.error(result.error.message);
    });
  }

  function handleNext() {
    startTransition(async () => {
      await setStep(implementationId, 4);
      router.push(`/training-planner/${implementationId}/modules`);
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-xs">
        Add trainers available for this implementation. Pick from your instructor roster, or add an
        external trainer (e.g., a vendor&apos;s specialist). Availability is hours dedicated to{" "}
        <em>this implementation</em>, not their total weekly hours. Use the calendar icon on each
        row to record PTO / unavailability windows so the scheduler plans around them.
      </p>

      {trainers.length === 0 ? (
        <div className="border-border bg-surface rounded-lg border border-dashed p-8 text-center">
          <p className="text-foreground text-sm font-medium">No trainers yet</p>
        </div>
      ) : (
        <div className="border-border overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-surface text-muted-foreground text-xs">
              <tr>
                <Th className="w-8" />
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Source</Th>
                <Th>Hrs/week</Th>
                <Th>Max concurrent</Th>
                <Th>Time off</Th>
                <Th className="w-12" />
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {trainers.map((t) => {
                const trainerPto = ptoByTrainer.get(t.id) ?? [];
                const isOpen = openPtoFor === t.id;
                return (
                  <TrainerRow
                    key={t.id}
                    t={t}
                    pto={trainerPto}
                    isOpen={isOpen}
                    onToggle={() => {
                      setOpenPtoFor(isOpen ? null : t.id);
                    }}
                    implementationId={implementationId}
                    pending={pending}
                    onUpdate={handleUpdate}
                    onDelete={handleDelete}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="border-border bg-background grid grid-cols-1 gap-3 rounded-lg border p-3 md:grid-cols-2">
        <div className="space-y-2">
          <p className="text-foreground text-xs font-semibold">From instructor roster</p>
          <select
            value={pickInstructor}
            onChange={(e) => {
              setPickInstructor(e.target.value);
            }}
            className={fieldClass + " w-full"}
            disabled={availableInstructors.length === 0}
          >
            <option value="">Select instructor…</option>
            {availableInstructors.map((i) => (
              <option key={i.id} value={i.id}>
                {i.full_name}
              </option>
            ))}
          </select>
          <div className="flex items-end gap-2">
            <div className="w-28">
              <p className="text-muted-foreground mb-1 text-xs font-medium">Hrs/week</p>
              <input
                type="number"
                step="0.5"
                min={0}
                value={hours}
                onChange={(e) => {
                  setHours(e.target.value);
                }}
                className={fieldClass + " w-full tabular-nums"}
              />
            </div>
            <button
              type="button"
              disabled={pending || !pickInstructor}
              onClick={addFromInstructor}
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              <PlusIcon className="h-4 w-4" />
              Add
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-foreground text-xs font-semibold">External trainer</p>
          <input
            value={externalName}
            onChange={(e) => {
              setExternalName(e.target.value);
            }}
            placeholder="Name"
            className={fieldClass + " w-full"}
          />
          <div className="flex items-end gap-2">
            <input
              value={externalEmail}
              onChange={(e) => {
                setExternalEmail(e.target.value);
              }}
              placeholder="Email"
              type="email"
              className={fieldClass + " flex-1"}
            />
            <button
              type="button"
              disabled={pending || !externalName.trim()}
              onClick={addExternal}
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              <PlusIcon className="h-4 w-4" />
              Add
            </button>
          </div>
        </div>
      </div>

      <div className="border-border flex items-center justify-between border-t pt-4">
        <button
          type="button"
          onClick={() => {
            router.push(`/training-planner/${implementationId}/rooms`);
          }}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back
        </button>
        <button
          type="button"
          disabled={pending || trainers.length === 0}
          onClick={handleNext}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          Save & continue
          <ArrowRightIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function TrainerRow({
  t,
  pto,
  isOpen,
  onToggle,
  implementationId,
  pending,
  onUpdate,
  onDelete,
}: {
  t: ImplTrainer;
  pto: ImplTrainerUnavailability[];
  isOpen: boolean;
  onToggle: () => void;
  implementationId: string;
  pending: boolean;
  onUpdate: (t: ImplTrainer, patch: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
}) {
  const router = useRouter();
  const [ptoPending, startPtoTransition] = useTransition();
  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState("");
  const [draftReason, setDraftReason] = useState("");

  function handleAddPto() {
    if (!draftStart || !draftEnd) {
      toast.error("Pick both start and end");
      return;
    }
    startPtoTransition(async () => {
      const result = await addTrainerUnavailability(t.id, implementationId, {
        starts_at: new Date(draftStart).toISOString(),
        ends_at: new Date(draftEnd).toISOString(),
        reason: draftReason.trim() || null,
      });
      if (result.ok) {
        setDraftStart("");
        setDraftEnd("");
        setDraftReason("");
        toast.success("Time off added");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleDeletePto(id: string) {
    startPtoTransition(async () => {
      const result = await deleteTrainerUnavailability(id, implementationId);
      if (result.ok) router.refresh();
      else toast.error(result.error.message);
    });
  }

  const ptoCount = pto.length;
  const rowPending = pending || ptoPending;

  return (
    <>
      <tr>
        <td className="px-2 py-2">
          <button
            type="button"
            onClick={onToggle}
            aria-label={isOpen ? "Hide time off" : "Show time off"}
            className="text-muted-foreground hover:text-foreground"
          >
            {isOpen ? (
              <ChevronDownIcon className="h-4 w-4" />
            ) : (
              <ChevronRightIcon className="h-4 w-4" />
            )}
          </button>
        </td>
        <td className="px-3 py-2">
          <input
            defaultValue={t.name}
            disabled={rowPending || !!t.instructor_id}
            onBlur={(e) => {
              if (!t.instructor_id && e.target.value !== t.name) {
                onUpdate(t, { name: e.target.value });
              }
            }}
            className={fieldClass + " w-full"}
          />
        </td>
        <td className="px-3 py-2">
          <input
            defaultValue={t.email ?? ""}
            disabled={rowPending}
            onBlur={(e) => {
              if (e.target.value !== (t.email ?? "")) {
                onUpdate(t, { email: e.target.value || null });
              }
            }}
            className={fieldClass + " w-full"}
            placeholder="—"
          />
        </td>
        <td className="text-muted-foreground px-3 py-2 text-xs">
          {t.instructor_id ? "Roster" : "External"}
        </td>
        <td className="px-3 py-2">
          <input
            type="number"
            step="0.5"
            min={0}
            defaultValue={t.availability_hours_per_week}
            disabled={rowPending}
            onBlur={(e) => {
              const v = Number(e.target.value);
              if (v !== t.availability_hours_per_week) {
                onUpdate(t, { availability_hours_per_week: v });
              }
            }}
            className={fieldClass + " w-20 tabular-nums"}
          />
        </td>
        <td className="px-3 py-2">
          <input
            type="number"
            min={1}
            defaultValue={t.max_concurrent_sessions}
            disabled={rowPending}
            onBlur={(e) => {
              const v = Number(e.target.value);
              if (v !== t.max_concurrent_sessions) {
                onUpdate(t, { max_concurrent_sessions: v });
              }
            }}
            className={fieldClass + " w-16 tabular-nums"}
          />
        </td>
        <td className="px-3 py-2">
          <button
            type="button"
            onClick={onToggle}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${
              ptoCount > 0
                ? "bg-amber-100 text-amber-900 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-100 dark:hover:bg-amber-900/50"
                : "text-muted-foreground hover:bg-surface"
            }`}
          >
            <CalendarDaysIcon className="h-3.5 w-3.5" />
            {ptoCount === 0 ? "Add" : `${String(ptoCount)} entr${ptoCount === 1 ? "y" : "ies"}`}
          </button>
        </td>
        <td className="px-3 py-2">
          <button
            type="button"
            disabled={rowPending}
            onClick={() => {
              onDelete(t.id);
            }}
            aria-label="Delete trainer"
            className="text-muted-foreground hover:text-destructive disabled:opacity-50"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </td>
      </tr>

      {isOpen && (
        <tr>
          <td />
          <td colSpan={7} className="bg-surface/50 px-3 py-3">
            <div className="space-y-2">
              <p className="text-foreground text-xs font-semibold">Time off / unavailability</p>
              {pto.length === 0 ? (
                <p className="text-muted-foreground text-xs italic">
                  No time off recorded. The scheduler will treat this trainer as fully available
                  during their weekly hours.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {pto.map((u) => (
                    <li
                      key={u.id}
                      className="border-border bg-background flex items-center justify-between gap-3 rounded-md border px-3 py-1.5 text-xs"
                    >
                      <span className="text-foreground tabular-nums">
                        {formatDateRange(u.starts_at, u.ends_at)}
                      </span>
                      <span className="text-muted-foreground flex-1 truncate">
                        {u.reason ?? "—"}
                      </span>
                      <button
                        type="button"
                        disabled={rowPending}
                        onClick={() => {
                          handleDeletePto(u.id);
                        }}
                        aria-label="Remove time off"
                        className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="border-border bg-background grid grid-cols-1 gap-2 rounded-md border p-2 sm:grid-cols-[1fr_1fr_2fr_auto]">
                <div>
                  <label
                    htmlFor={`pto-start-${t.id}`}
                    className="text-muted-foreground mb-0.5 block text-[10px] font-medium uppercase"
                  >
                    Start
                  </label>
                  <input
                    id={`pto-start-${t.id}`}
                    type="datetime-local"
                    value={draftStart}
                    onChange={(e) => {
                      setDraftStart(e.target.value);
                    }}
                    className={fieldClass + " w-full"}
                  />
                </div>
                <div>
                  <label
                    htmlFor={`pto-end-${t.id}`}
                    className="text-muted-foreground mb-0.5 block text-[10px] font-medium uppercase"
                  >
                    End
                  </label>
                  <input
                    id={`pto-end-${t.id}`}
                    type="datetime-local"
                    value={draftEnd}
                    onChange={(e) => {
                      setDraftEnd(e.target.value);
                    }}
                    className={fieldClass + " w-full"}
                  />
                </div>
                <div>
                  <label
                    htmlFor={`pto-reason-${t.id}`}
                    className="text-muted-foreground mb-0.5 block text-[10px] font-medium uppercase"
                  >
                    Reason (optional)
                  </label>
                  <input
                    id={`pto-reason-${t.id}`}
                    type="text"
                    value={draftReason}
                    onChange={(e) => {
                      setDraftReason(e.target.value);
                    }}
                    placeholder="Vacation, conference, on-call coverage…"
                    className={fieldClass + " w-full"}
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    disabled={rowPending || !draftStart || !draftEnd}
                    onClick={handleAddPto}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                  >
                    <PlusIcon className="h-4 w-4" />
                    Add
                  </button>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function formatDateRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const sameDay = start.toDateString() === end.toDateString();
  const datePart = (d: Date): string =>
    d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const timePart = (d: Date): string =>
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (sameDay) {
    return `${datePart(start)}, ${timePart(start)} – ${timePart(end)}`;
  }
  return `${datePart(start)} ${timePart(start)} – ${datePart(end)} ${timePart(end)}`;
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-3 py-2 text-left text-xs font-medium uppercase tracking-wide ${className ?? ""}`}
    >
      {children}
    </th>
  );
}
