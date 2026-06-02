"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  ArchiveBoxIcon,
  ArrowDownTrayIcon,
  ArrowUturnLeftIcon,
  CheckCircleIcon,
  DocumentCheckIcon,
  ExclamationTriangleIcon,
  RocketLaunchIcon,
  XCircleIcon,
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
  isArchived: boolean;
  onDocument: () => void;
  onComplete: () => void;
  onCancel: () => void;
  onReopen: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onConvert: () => void;
  goToStep: (step: number) => void;
};

export default function Step9Review({
  tra,
  objectives,
  deliverables,
  deliverableTypes,
  pending,
  isArchived,
  onDocument,
  onComplete,
  onCancel,
  onReopen,
  onArchive,
  onUnarchive,
  onConvert,
  goToStep,
}: Props) {
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
      if (r.ok) toast.success("Adjustments saved");
      else toast.error(r.error.message);
    });
  }

  // What's available depends on current status.
  const showDocument = tra.status === "draft";
  const showConvert = tra.status === "documented";
  const showComplete = tra.status === "documented" || tra.status === "converted";
  const showCancel =
    tra.status === "draft" || tra.status === "documented" || tra.status === "converted";
  const showReopen = tra.status === "completed" || tra.status === "cancelled";

  const statusBlurb = (() => {
    switch (tra.status) {
      case "draft":
        return "Still editing. Mark as documented when the request is captured.";
      case "documented":
        return "Captured and ready. Convert to a project to start work, or mark complete if no project is needed.";
      case "converted":
        return "Tied to a project. Mark complete when the training has been delivered.";
      case "completed":
        return "Training delivered. Reopen if the request needs another round.";
      case "cancelled":
        return "Not being pursued. Reopen if you want to act on it again.";
    }
  })();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* Status / actions */}
      <div className="border-border bg-background flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
        <p className="text-muted-foreground text-xs">{statusBlurb}</p>
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

          {showDocument && (
            <button
              type="button"
              disabled={pending}
              onClick={onDocument}
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              <DocumentCheckIcon className="h-4 w-4" />
              Mark as documented
            </button>
          )}

          {showConvert && (
            <button
              type="button"
              disabled={pending}
              onClick={onConvert}
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              <RocketLaunchIcon className="h-4 w-4" />
              Convert to project
            </button>
          )}

          {showComplete && (
            <button
              type="button"
              disabled={pending}
              onClick={onComplete}
              className="bg-success hover:bg-success inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              <CheckCircleIcon className="h-4 w-4" />
              Mark complete
            </button>
          )}

          {showCancel && (
            <button
              type="button"
              disabled={pending}
              onClick={onCancel}
              className="border-border text-destructive hover:bg-surface inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              <XCircleIcon className="h-4 w-4" />
              Cancel
            </button>
          )}

          {showReopen && (
            <button
              type="button"
              disabled={pending}
              onClick={onReopen}
              className="border-border text-foreground hover:bg-surface inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              <ArrowUturnLeftIcon className="h-4 w-4" />
              Reopen
            </button>
          )}

          {isArchived ? (
            <button
              type="button"
              disabled={pending}
              onClick={onUnarchive}
              className="border-border text-foreground hover:bg-surface inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              <ArrowUturnLeftIcon className="h-4 w-4" />
              Unarchive
            </button>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={onArchive}
              className="border-border text-muted-foreground hover:bg-surface inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              <ArchiveBoxIcon className="h-4 w-4" />
              Archive
            </button>
          )}
        </div>
      </div>

      {/* Gap banner — non-blocking, listed by section. Only shown while
          drafting; once a TRA is documented the gaps stop being noisy. */}
      {tra.status === "draft" && gaps.length > 0 && (
        <div className="border-warning-bd bg-warning-bg rounded-xl border p-4">
          <div className="flex items-start gap-2">
            <ExclamationTriangleIcon className="text-warning mt-0.5 h-5 w-5 shrink-0" />
            <div className="min-w-0">
              <p className="text-foreground text-sm font-medium">
                {gaps.length} field{gaps.length === 1 ? "" : "s"} typically expected before marking
                documented
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                You can mark it documented anyway — the gaps just sit visible to anyone reading
                later.
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

      {/* Inline effort estimator — the "estimation happens during input"
          signature element from the editorial design. Forest-tinted card,
          deliverables aggregated by type, big serif total in forest green. */}
      <section className="border-border bg-background rounded-xl border p-6">
        <div className="mb-3 flex items-center justify-between font-mono text-[10px] uppercase leading-none tracking-[0.08em]">
          <span className="text-muted-foreground">Effort estimate · auto-calculated</span>
          <span className="text-muted-foreground">From section 5 deliverables</span>
        </div>

        {breakdown.length === 0 ? (
          <p className="text-muted-foreground py-2 text-sm">
            No deliverables yet. Go back to Section 5 to add some.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {breakdown.map((b) => (
              <div
                key={b.name}
                className="grid grid-cols-[1fr_50px_50px] gap-2.5 border-b border-dashed border-[var(--hair-soft,rgba(28,31,28,0.10))] py-1 font-mono text-[11px] leading-tight last:border-b-0"
              >
                <span className="text-muted-foreground truncate">
                  {b.name}
                  <span className="ml-1.5 text-[10px]">
                    · {b.count} deliverable{b.count === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="text-muted-foreground text-right tabular-nums">
                  {b.hours.toFixed(0)} h
                </span>
                <span className="text-foreground text-right tabular-nums">
                  {b.hours.toFixed(0)}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 flex items-baseline justify-between border-t border-[var(--hair,rgba(28,31,28,0.16))] pt-2.5 font-mono text-[11px] uppercase leading-none tracking-[0.04em]">
          <span className="text-muted-foreground">Total trainer hours</span>
          <span className="font-display text-[22px] font-medium normal-case leading-none tracking-[-0.01em] text-[var(--forest,var(--primary))]">
            {total.toFixed(0)} h
          </span>
        </div>

        {/* Secondary stats — kept understated under the estimator */}
        <div className="border-border text-muted-foreground mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t border-dashed pt-3 font-mono text-[10.5px] tracking-[0.04em]">
          <span>
            {deliverables.length} deliverable{deliverables.length === 1 ? "" : "s"}
          </span>
          <span>
            Stored on intake ·{" "}
            <b className="text-foreground font-medium">{tra.total_estimated_hours.toFixed(0)} h</b>
          </span>
        </div>
      </section>

      {/* Adjustments */}
      <section className="border-border bg-background rounded-xl border p-6">
        <h3 className="text-foreground mb-1 text-sm font-semibold">Adjustments / assumptions</h3>
        <p className="text-muted-foreground mb-3 text-xs">
          Notes captured here travel with the work intake and into the generated document.
        </p>
        <textarea
          rows={5}
          value={adjustments}
          onChange={(e) => {
            setAdjustments(e.target.value);
          }}
          disabled={adjustmentsPending}
          placeholder="e.g. Includes 20% buffer for stakeholder reviews. Excludes localization."
          className="border-input bg-background text-foreground focus:ring-ring w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 disabled:opacity-50"
        />
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            disabled={adjustmentsPending || !dirty}
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
