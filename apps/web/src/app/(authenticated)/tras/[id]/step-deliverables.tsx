"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { PlusIcon, TrashIcon } from "@heroicons/react/20/solid";
import { computeDeliverableEstimatedHours } from "@arbor/shared";
import type { DeliverableType, TraDeliverable } from "@arbor/shared";
import { addDeliverable, updateDeliverable, removeDeliverable } from "../actions";

type Props = {
  traId: string;
  deliverables: TraDeliverable[];
  deliverableTypes: DeliverableType[];
  disabled: boolean;
};

const COMPLEXITY_MARKS: { value: number; label: string }[] = [
  { value: 0.5, label: "0.5" },
  { value: 0.75, label: "0.75" },
  { value: 1.0, label: "1.0" },
  { value: 1.5, label: "1.5" },
  { value: 2.0, label: "2.0" },
  { value: 3.0, label: "3.0" },
];

export default function StepDeliverables({
  traId,
  deliverables,
  deliverableTypes,
  disabled,
}: Props) {
  const [pending, startTransition] = useTransition();

  const typesById = useMemo(
    () => new Map(deliverableTypes.map((t) => [t.id, t])),
    [deliverableTypes],
  );

  const liveTotal = useMemo(() => {
    return deliverables.reduce((acc, d) => acc + (d.estimated_hours || 0), 0);
  }, [deliverables]);

  // ── Add row ───────────────────────────────────────────────────────────────
  const [adding, setAdding] = useState(false);
  const [newTypeId, setNewTypeId] = useState(deliverableTypes[0]?.id ?? "");
  const [newName, setNewName] = useState("");
  const [newSeatTime, setNewSeatTime] = useState(1);
  const [newQuantity, setNewQuantity] = useState(1);
  const [newComplexity, setNewComplexity] = useState(1);
  const [newNotes, setNewNotes] = useState("");

  const newType = typesById.get(newTypeId);
  const newPreview = newType
    ? computeDeliverableEstimatedHours({
        seat_time_hours: newSeatTime,
        dev_to_seat_ratio: newType.dev_to_seat_ratio,
        quantity: newQuantity,
        complexity_multiplier: newComplexity,
      })
    : 0;

  function resetAddForm() {
    setNewName("");
    setNewSeatTime(1);
    setNewQuantity(1);
    setNewComplexity(1);
    setNewNotes("");
    setAdding(false);
  }

  function handleAdd() {
    if (!newTypeId || !newName.trim()) {
      toast.error("Type and name are required");
      return;
    }
    startTransition(async () => {
      const result = await addDeliverable(traId, {
        deliverable_type_id: newTypeId,
        name: newName,
        seat_time_hours: newSeatTime,
        quantity: newQuantity,
        complexity_multiplier: newComplexity,
        notes: newNotes || null,
      });
      if (result.ok) {
        toast.success("Deliverable added");
        resetAddForm();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleRemove(deliverableId: string) {
    startTransition(async () => {
      const result = await removeDeliverable(deliverableId, traId);
      if (result.ok) toast.success("Removed");
      else toast.error(result.error.message);
    });
  }

  return (
    <div className="space-y-4">
      {/* List */}
      {deliverables.length === 0 ? (
        <div className="border-border bg-surface rounded-xl border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">
            No deliverables yet. Add one to start estimating.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {deliverables.map((d) => (
            <DeliverableRow
              key={d.id}
              deliverable={d}
              type={typesById.get(d.deliverable_type_id)}
              traId={traId}
              disabled={disabled || pending}
              onRemove={() => {
                handleRemove(d.id);
              }}
            />
          ))}
        </div>
      )}

      {/* Add row */}
      {!disabled && (
        <>
          {!adding && deliverableTypes.length > 0 && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setAdding(true);
                }}
                className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium"
              >
                <PlusIcon className="h-4 w-4" />
                Add deliverable
              </button>
            </div>
          )}
          {!adding && deliverableTypes.length === 0 && (
            <p className="text-muted-foreground text-xs">
              No deliverable types are available. Ask an admin to seed the catalog.
            </p>
          )}
          {adding && (
            <div className="border-border bg-background space-y-3 rounded-xl border p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="new-type"
                    className="text-muted-foreground mb-1 block text-xs font-medium"
                  >
                    Deliverable type *
                  </label>
                  <select
                    id="new-type"
                    value={newTypeId}
                    onChange={(e) => {
                      setNewTypeId(e.target.value);
                    }}
                    className="border-input bg-background text-foreground w-full rounded-md border px-2 py-1.5 text-sm"
                  >
                    {deliverableTypes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.dev_to_seat_ratio.toFixed(0)}:1)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="new-name"
                    className="text-muted-foreground mb-1 block text-xs font-medium"
                  >
                    Name *
                  </label>
                  <input
                    id="new-name"
                    value={newName}
                    onChange={(e) => {
                      setNewName(e.target.value);
                    }}
                    placeholder="Onboarding Module 1"
                    className="border-input bg-background text-foreground w-full rounded-md border px-2 py-1.5 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label
                    htmlFor="new-seat"
                    className="text-muted-foreground mb-1 block text-xs font-medium"
                  >
                    Seat-time hours
                  </label>
                  <input
                    id="new-seat"
                    type="number"
                    step="0.25"
                    min={0}
                    value={newSeatTime}
                    onChange={(e) => {
                      setNewSeatTime(Number(e.target.value));
                    }}
                    className="border-input bg-background text-foreground w-full rounded-md border px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label
                    htmlFor="new-qty"
                    className="text-muted-foreground mb-1 block text-xs font-medium"
                  >
                    Quantity
                  </label>
                  <input
                    id="new-qty"
                    type="number"
                    min={1}
                    value={newQuantity}
                    onChange={(e) => {
                      setNewQuantity(Number(e.target.value));
                    }}
                    className="border-input bg-background text-foreground w-full rounded-md border px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label
                    htmlFor="new-complexity"
                    className="text-muted-foreground mb-1 block text-xs font-medium"
                  >
                    Complexity ({newComplexity.toFixed(2)}×)
                  </label>
                  <input
                    id="new-complexity"
                    type="range"
                    min={0.5}
                    max={3}
                    step={0.05}
                    list="complexity-marks"
                    value={newComplexity}
                    onChange={(e) => {
                      setNewComplexity(Number(e.target.value));
                    }}
                    className="w-full"
                  />
                  <datalist id="complexity-marks">
                    {COMPLEXITY_MARKS.map((m) => (
                      <option key={m.value} value={m.value} label={m.label} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div>
                <label
                  htmlFor="new-notes"
                  className="text-muted-foreground mb-1 block text-xs font-medium"
                >
                  Notes
                </label>
                <input
                  id="new-notes"
                  value={newNotes}
                  onChange={(e) => {
                    setNewNotes(e.target.value);
                  }}
                  className="border-input bg-background text-foreground w-full rounded-md border px-2 py-1.5 text-sm"
                />
              </div>

              <div className="border-border bg-surface flex items-center justify-between rounded-md border p-2">
                <span className="text-muted-foreground text-xs">Estimated hours</span>
                <span className="text-foreground text-sm font-semibold tabular-nums">
                  {newPreview.toFixed(1)} h
                </span>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={resetAddForm}
                  className="text-muted-foreground hover:text-foreground text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={handleAdd}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1 text-xs font-medium disabled:opacity-50"
                >
                  {pending ? "Adding…" : "Add"}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Live total */}
      <div className="border-border bg-background flex items-center justify-between rounded-xl border p-4">
        <span className="text-foreground text-sm font-semibold">Total estimated hours</span>
        <span className="text-foreground text-2xl font-semibold tabular-nums">
          {liveTotal.toFixed(1)} h
        </span>
      </div>
    </div>
  );
}

// Editable row for an existing deliverable. Saves on blur to avoid hammering
// the server on every keystroke; the per-row estimated_hours updates locally
// for instant feedback and the trigger reconciles on save.

function DeliverableRow({
  deliverable,
  type,
  traId,
  disabled,
  onRemove,
}: {
  deliverable: TraDeliverable;
  type: DeliverableType | undefined;
  traId: string;
  disabled: boolean;
  onRemove: () => void;
}) {
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState(deliverable.name);
  const [seatTime, setSeatTime] = useState(deliverable.seat_time_hours);
  const [quantity, setQuantity] = useState(deliverable.quantity);
  const [complexity, setComplexity] = useState(deliverable.complexity_multiplier);
  const [notes, setNotes] = useState(deliverable.notes ?? "");

  const ratio = type ? type.dev_to_seat_ratio : 0;
  const estimated = computeDeliverableEstimatedHours({
    seat_time_hours: seatTime,
    dev_to_seat_ratio: ratio,
    quantity,
    complexity_multiplier: complexity,
  });

  function persist(patch: Record<string, unknown>) {
    startTransition(async () => {
      const result = await updateDeliverable(deliverable.id, traId, patch);
      if (!result.ok) toast.error(result.error.message);
    });
  }

  return (
    <div className="border-border bg-background rounded-xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground mb-1 text-xs font-medium">Type</p>
              <p className="text-foreground text-sm">
                {type?.name ?? "Unknown type"}{" "}
                {type && (
                  <span className="text-muted-foreground text-xs">({ratio.toFixed(0)}:1)</span>
                )}
              </p>
            </div>
            <div>
              <label className="text-muted-foreground mb-1 block text-xs font-medium">Name</label>
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                }}
                onBlur={() => {
                  if (name !== deliverable.name) persist({ name });
                }}
                disabled={disabled}
                className="border-input bg-background text-foreground w-full rounded-md border px-2 py-1.5 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="text-muted-foreground mb-1 block text-xs font-medium">
                Seat-time hrs
              </label>
              <input
                type="number"
                step="0.25"
                min={0}
                value={seatTime}
                onChange={(e) => {
                  setSeatTime(Number(e.target.value));
                }}
                onBlur={() => {
                  if (seatTime !== deliverable.seat_time_hours)
                    persist({ seat_time_hours: seatTime });
                }}
                disabled={disabled}
                className="border-input bg-background text-foreground w-full rounded-md border px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-muted-foreground mb-1 block text-xs font-medium">
                Quantity
              </label>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => {
                  setQuantity(Number(e.target.value));
                }}
                onBlur={() => {
                  if (quantity !== deliverable.quantity) persist({ quantity });
                }}
                disabled={disabled}
                className="border-input bg-background text-foreground w-full rounded-md border px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-muted-foreground mb-1 block text-xs font-medium">
                Complexity ({complexity.toFixed(2)}×)
              </label>
              <input
                type="range"
                min={0.5}
                max={3}
                step={0.05}
                list="complexity-marks-row"
                value={complexity}
                onChange={(e) => {
                  setComplexity(Number(e.target.value));
                }}
                onMouseUp={() => {
                  if (complexity !== deliverable.complexity_multiplier)
                    persist({ complexity_multiplier: complexity });
                }}
                onTouchEnd={() => {
                  if (complexity !== deliverable.complexity_multiplier)
                    persist({ complexity_multiplier: complexity });
                }}
                disabled={disabled}
                className="w-full"
              />
              <datalist id="complexity-marks-row">
                {COMPLEXITY_MARKS.map((m) => (
                  <option key={m.value} value={m.value} label={m.label} />
                ))}
              </datalist>
            </div>
          </div>

          <div>
            <label className="text-muted-foreground mb-1 block text-xs font-medium">Notes</label>
            <input
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
              }}
              onBlur={() => {
                if (notes !== (deliverable.notes ?? "")) persist({ notes: notes || null });
              }}
              disabled={disabled}
              className="border-input bg-background text-foreground w-full rounded-md border px-2 py-1.5 text-sm"
            />
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <span className="text-foreground text-base font-semibold tabular-nums">
            {estimated.toFixed(1)} h
          </span>
          <button
            type="button"
            disabled={disabled || pending}
            onClick={onRemove}
            aria-label={`Remove ${deliverable.name}`}
            className="text-muted-foreground hover:text-destructive disabled:opacity-50"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
