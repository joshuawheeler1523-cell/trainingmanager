"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { DeliverableType, Tra, TraDeliverable } from "@arbor/shared";
import { updateTra } from "../actions";

type Props = {
  tra: Tra;
  deliverables: TraDeliverable[];
  deliverableTypes: DeliverableType[];
  disabled: boolean;
};

export default function StepReview({ tra, deliverables, deliverableTypes, disabled }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adjustments, setAdjustments] = useState(tra.adjustments_notes ?? "");

  const breakdown = useMemo(() => {
    const typeName = new Map(deliverableTypes.map((t) => [t.id, t.name]));
    const byType = new Map<string, { name: string; hours: number; count: number }>();
    for (const d of deliverables) {
      const name = typeName.get(d.deliverable_type_id) ?? "Unknown";
      const cur = byType.get(d.deliverable_type_id) ?? { name, hours: 0, count: 0 };
      cur.hours += d.estimated_hours || 0;
      cur.count += 1;
      byType.set(d.deliverable_type_id, cur);
    }
    return Array.from(byType.values()).sort((a, b) => b.hours - a.hours);
  }, [deliverables, deliverableTypes]);

  const total = deliverables.reduce((acc, d) => acc + (d.estimated_hours || 0), 0);
  const dirty = adjustments !== (tra.adjustments_notes ?? "");

  function handleApply() {
    startTransition(async () => {
      const result = await updateTra(tra.id, { adjustments_notes: adjustments || null });
      if (result.ok) {
        toast.success("Adjustments saved");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Summary */}
      <section className="border-border bg-background rounded-xl border p-6">
        <h3 className="text-foreground mb-4 text-sm font-semibold">Summary</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-muted-foreground text-xs font-medium">Total deliverables</p>
            <p className="text-foreground mt-1 text-2xl font-semibold tabular-nums">
              {deliverables.length}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs font-medium">Total estimated hours</p>
            <p className="text-foreground mt-1 text-2xl font-semibold tabular-nums">
              {total.toFixed(1)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs font-medium">Stored on TRA</p>
            <p className="text-foreground mt-1 text-2xl font-semibold tabular-nums">
              {tra.total_estimated_hours.toFixed(1)}
            </p>
          </div>
        </div>
      </section>

      {/* Breakdown by type */}
      <section className="border-border bg-background rounded-xl border p-6">
        <h3 className="text-foreground mb-4 text-sm font-semibold">
          Breakdown by deliverable type
        </h3>
        {breakdown.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No deliverables yet. Go back to Step 2 to add some.
          </p>
        ) : (
          <ul className="divide-border divide-y">
            {breakdown.map((b) => (
              <li key={b.name} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-foreground text-sm font-medium">{b.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {b.count} deliverable{b.count === 1 ? "" : "s"}
                  </p>
                </div>
                <span className="text-foreground text-base font-semibold tabular-nums">
                  {b.hours.toFixed(1)} h
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Adjustments */}
      <section className="border-border bg-background rounded-xl border p-6">
        <h3 className="text-foreground mb-1 text-sm font-semibold">Adjustments / assumptions</h3>
        <p className="text-muted-foreground mb-3 text-xs">
          Notes captured here travel with the TRA and into the generated document.
        </p>
        <textarea
          rows={5}
          value={adjustments}
          onChange={(e) => {
            setAdjustments(e.target.value);
          }}
          disabled={disabled || pending}
          placeholder="e.g. Includes 20% buffer for stakeholder reviews. Excludes localization."
          className="border-input bg-background text-foreground focus:ring-ring w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 disabled:opacity-50"
        />
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            disabled={disabled || pending || !dirty}
            onClick={handleApply}
            className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Applying…" : "Apply"}
          </button>
        </div>
      </section>
    </div>
  );
}
