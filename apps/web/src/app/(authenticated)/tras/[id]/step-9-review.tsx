"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowDownTrayIcon,
  CheckBadgeIcon,
  ExclamationTriangleIcon,
  PaperAirplaneIcon,
  RocketLaunchIcon,
  XMarkIcon,
} from "@heroicons/react/20/solid";
import {
  listSubmitGaps,
  type DeliverableType,
  type Tra,
  type TraDeliverable,
  type TraObjective,
} from "@arbor/shared";
import { updateTra } from "../actions";

type Props = {
  tra: Tra;
  objectives: TraObjective[];
  deliverables: TraDeliverable[];
  deliverableTypes: DeliverableType[];
  pending: boolean;
  onSubmit: () => void;
  onApprove: () => void;
  onReject: () => void;
  onConvert: () => void;
  goToStep: (step: number) => void;
};

export default function Step9Review({
  tra,
  objectives,
  deliverables,
  deliverableTypes,
  pending,
  onSubmit,
  onApprove,
  onReject,
  onConvert,
  goToStep,
}: Props) {
  const router = useRouter();
  const [adjustmentsPending, startTransition] = useTransition();
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

  const gaps = useMemo(
    () =>
      listSubmitGaps(
        {
          business_problem: tra.business_problem,
          cost_of_inaction: tra.cost_of_inaction,
          root_cause_answer: tra.root_cause_answer,
          priority: tra.priority,
        },
        objectives.some((o) => o.text && o.text.trim() !== ""),
      ),
    [tra.business_problem, tra.cost_of_inaction, tra.root_cause_answer, tra.priority, objectives],
  );

  function handleApply() {
    startTransition(async () => {
      const r = await updateTra(tra.id, { adjustments_notes: adjustments || null });
      if (r.ok) {
        toast.success("Adjustments saved");
        router.refresh();
      } else {
        toast.error(r.error.message);
      }
    });
  }

  const canSubmit = tra.status === "draft";
  const canApproveOrReject = tra.status === "submitted";
  const canConvert = tra.status === "approved";
  const isLocked = tra.status === "converted";

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* Status / actions */}
      <div className="border-border bg-background flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
        <p className="text-muted-foreground text-xs">
          {isLocked
            ? "This TRA has been converted to a project."
            : tra.status === "rejected"
              ? "This TRA was rejected. Edit the form and resubmit if you want another review."
              : "Review the summary, fix any gaps, then submit / approve / convert."}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/api/tras/${tra.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="border-border text-foreground hover:bg-surface inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium"
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
            Export PDF
          </a>

          {canSubmit && (
            <button
              type="button"
              disabled={pending}
              onClick={onSubmit}
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              <PaperAirplaneIcon className="h-4 w-4" />
              {gaps.length > 0 ? "Submit anyway" : "Submit for approval"}
            </button>
          )}

          {canApproveOrReject && (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={onReject}
                className="border-border text-destructive hover:bg-surface inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              >
                <XMarkIcon className="h-4 w-4" />
                Reject
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={onApprove}
                className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                <CheckBadgeIcon className="h-4 w-4" />
                Approve
              </button>
            </>
          )}

          <button
            type="button"
            disabled={!canConvert || pending}
            onClick={onConvert}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            <RocketLaunchIcon className="h-4 w-4" />
            Convert to project
          </button>
        </div>
      </div>

      {/* Gap banner — non-blocking, listed by section */}
      {canSubmit && gaps.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/30">
          <div className="flex items-start gap-2">
            <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0">
              <p className="text-foreground text-sm font-medium">
                {gaps.length} field{gaps.length === 1 ? "" : "s"} typically required before
                submitting
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                You can still submit — the reviewer will see what&apos;s missing.
              </p>
              <ul className="mt-2 space-y-0.5">
                {gaps.map((g) => (
                  <li key={g.field} className="text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        goToStep(g.section);
                      }}
                      className="text-primary hover:underline"
                    >
                      Section {g.section} → {g.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

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
            No deliverables yet. Go back to Section 5 to add some.
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
          disabled={isLocked || adjustmentsPending}
          placeholder="e.g. Includes 20% buffer for stakeholder reviews. Excludes localization."
          className="border-input bg-background text-foreground focus:ring-ring w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 disabled:opacity-50"
        />
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            disabled={isLocked || adjustmentsPending || !dirty}
            onClick={handleApply}
            className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {adjustmentsPending ? "Applying…" : "Apply"}
          </button>
        </div>
      </section>
    </div>
  );
}
