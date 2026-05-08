"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeftIcon, ArrowRightIcon, PlusIcon, TrashIcon } from "@heroicons/react/20/solid";
import type { ImplRoom } from "@arbor/shared";
import { createRoom, deleteRoom, setStep, updateRoom } from "../../actions";

type Props = {
  implementationId: string;
  rooms: ImplRoom[];
};

const DAYS = [
  { num: 1, short: "M" },
  { num: 2, short: "T" },
  { num: 3, short: "W" },
  { num: 4, short: "Th" },
  { num: 5, short: "F" },
  { num: 6, short: "Sa" },
  { num: 0, short: "Su" },
];

const fieldClass =
  "border-input bg-background text-foreground rounded-md border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export default function RoomsEditor({ implementationId, rooms }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [newName, setNewName] = useState("");
  const [newCapacity, setNewCapacity] = useState("12");
  const [newHours, setNewHours] = useState("8");

  function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    startTransition(async () => {
      const result = await createRoom(implementationId, {
        name,
        seat_capacity: Number(newCapacity),
        available_hours_per_day: Number(newHours),
      });
      if (result.ok) {
        setNewName("");
        setNewCapacity("12");
        setNewHours("8");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleUpdate(r: ImplRoom, patch: Record<string, unknown>) {
    startTransition(async () => {
      const result = await updateRoom(r.id, implementationId, patch);
      if (result.ok) router.refresh();
      else toast.error(result.error.message);
    });
  }

  function handleToggleDay(r: ImplRoom, day: number) {
    const days = new Set(r.available_days_of_week);
    if (days.has(day)) days.delete(day);
    else days.add(day);
    handleUpdate(r, { available_days_of_week: Array.from(days).sort((a, b) => a - b) });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteRoom(id, implementationId);
      if (result.ok) router.refresh();
      else toast.error(result.error.message);
    });
  }

  function handleNext() {
    startTransition(async () => {
      await setStep(implementationId, 3);
      router.push(`/training-planner/${implementationId}/trainers`);
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-xs">
        Add the training rooms available for this implementation. The platform will use these to
        place sessions and detect double-booking.
      </p>

      {rooms.length === 0 ? (
        <div className="border-border bg-surface rounded-lg border border-dashed p-8 text-center">
          <p className="text-foreground text-sm font-medium">No rooms yet</p>
          <p className="text-muted-foreground mt-1 text-xs">Most implementations have 2–8 rooms.</p>
        </div>
      ) : (
        <div className="border-border overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-surface text-muted-foreground text-xs">
              <tr>
                <Th className="w-1/4">Name</Th>
                <Th>Location</Th>
                <Th>Capacity</Th>
                <Th>Hrs/day</Th>
                <Th>Days</Th>
                <Th>Equipment</Th>
                <Th className="w-12" />
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {rooms.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2">
                    <input
                      defaultValue={r.name}
                      disabled={pending}
                      onBlur={(e) => {
                        if (e.target.value !== r.name) handleUpdate(r, { name: e.target.value });
                      }}
                      className={fieldClass + " w-full"}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      defaultValue={r.location ?? ""}
                      disabled={pending}
                      onBlur={(e) => {
                        if (e.target.value !== (r.location ?? "")) {
                          handleUpdate(r, { location: e.target.value || null });
                        }
                      }}
                      className={fieldClass + " w-full"}
                      placeholder="—"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={1}
                      defaultValue={r.seat_capacity}
                      disabled={pending}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v !== r.seat_capacity) handleUpdate(r, { seat_capacity: v });
                      }}
                      className={fieldClass + " w-20 tabular-nums"}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="0.5"
                      min={0.5}
                      max={24}
                      defaultValue={r.available_hours_per_day}
                      disabled={pending}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v !== r.available_hours_per_day) {
                          handleUpdate(r, { available_hours_per_day: v });
                        }
                      }}
                      className={fieldClass + " w-20 tabular-nums"}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-0.5">
                      {DAYS.map((d) => {
                        const active = r.available_days_of_week.includes(d.num);
                        return (
                          <button
                            key={d.num}
                            type="button"
                            disabled={pending}
                            onClick={() => {
                              handleToggleDay(r, d.num);
                            }}
                            aria-label={`Toggle ${d.short}`}
                            className={`h-6 w-6 rounded text-[10px] font-medium ${
                              active
                                ? "bg-primary text-primary-foreground"
                                : "bg-surface text-muted-foreground"
                            }`}
                          >
                            {d.short}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      defaultValue={r.equipment_notes ?? ""}
                      disabled={pending}
                      onBlur={(e) => {
                        if (e.target.value !== (r.equipment_notes ?? "")) {
                          handleUpdate(r, { equipment_notes: e.target.value || null });
                        }
                      }}
                      placeholder="e.g. IV pump simulator"
                      className={fieldClass + " w-full"}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        handleDelete(r.id);
                      }}
                      aria-label="Delete room"
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

      {/* Add row */}
      <div className="border-border bg-background flex items-end gap-2 rounded-lg border p-3">
        <div className="flex-1">
          <p className="text-muted-foreground mb-1 text-xs font-medium">Room name</p>
          <input
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
            placeholder="e.g. Education Room 3"
            className={fieldClass + " w-full"}
          />
        </div>
        <div className="w-24">
          <p className="text-muted-foreground mb-1 text-xs font-medium">Capacity</p>
          <input
            type="number"
            min={1}
            value={newCapacity}
            onChange={(e) => {
              setNewCapacity(e.target.value);
            }}
            className={fieldClass + " w-full tabular-nums"}
          />
        </div>
        <div className="w-24">
          <p className="text-muted-foreground mb-1 text-xs font-medium">Hrs/day</p>
          <input
            type="number"
            step="0.5"
            min={0.5}
            max={24}
            value={newHours}
            onChange={(e) => {
              setNewHours(e.target.value);
            }}
            className={fieldClass + " w-full tabular-nums"}
          />
        </div>
        <button
          type="button"
          disabled={pending || !newName.trim()}
          onClick={handleAdd}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          <PlusIcon className="h-4 w-4" />
          Add
        </button>
      </div>

      <div className="border-border flex items-center justify-between border-t pt-4">
        <button
          type="button"
          onClick={() => {
            router.push(`/training-planner/${implementationId}/setup`);
          }}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back
        </button>
        <button
          type="button"
          disabled={pending || rooms.length === 0}
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
