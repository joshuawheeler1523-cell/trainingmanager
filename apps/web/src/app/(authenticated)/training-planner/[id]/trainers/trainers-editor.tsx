"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeftIcon, ArrowRightIcon, PlusIcon, TrashIcon } from "@heroicons/react/20/solid";
import type { ImplTrainer, Instructor } from "@arbor/shared";
import { createTrainer, deleteTrainer, setStep, updateTrainer } from "../../actions";

type Props = {
  implementationId: string;
  trainers: ImplTrainer[];
  instructors: Instructor[];
};

const fieldClass =
  "border-input bg-background text-foreground rounded-md border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export default function TrainersEditor({ implementationId, trainers, instructors }: Props) {
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
        <em>this implementation</em>, not their total weekly hours.
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
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Source</Th>
                <Th>Hrs/week</Th>
                <Th>Max concurrent</Th>
                <Th className="w-12" />
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {trainers.map((t) => (
                <tr key={t.id}>
                  <td className="px-3 py-2">
                    <input
                      defaultValue={t.name}
                      disabled={pending || !!t.instructor_id}
                      onBlur={(e) => {
                        if (!t.instructor_id && e.target.value !== t.name) {
                          handleUpdate(t, { name: e.target.value });
                        }
                      }}
                      className={fieldClass + " w-full"}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      defaultValue={t.email ?? ""}
                      disabled={pending}
                      onBlur={(e) => {
                        if (e.target.value !== (t.email ?? "")) {
                          handleUpdate(t, { email: e.target.value || null });
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
                      disabled={pending}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v !== t.availability_hours_per_week) {
                          handleUpdate(t, { availability_hours_per_week: v });
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
                      disabled={pending}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v !== t.max_concurrent_sessions) {
                          handleUpdate(t, { max_concurrent_sessions: v });
                        }
                      }}
                      className={fieldClass + " w-16 tabular-nums"}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        handleDelete(t.id);
                      }}
                      aria-label="Delete trainer"
                      className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="border-border bg-background grid grid-cols-1 gap-3 rounded-lg border p-3 md:grid-cols-2">
        {/* Add from roster */}
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

        {/* Add external */}
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

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-3 py-2 text-left text-xs font-medium uppercase tracking-wide ${className ?? ""}`}
    >
      {children}
    </th>
  );
}
