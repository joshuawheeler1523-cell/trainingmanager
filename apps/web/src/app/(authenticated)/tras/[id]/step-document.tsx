"use client";

import {
  ArrowDownTrayIcon,
  CheckBadgeIcon,
  PaperAirplaneIcon,
  RocketLaunchIcon,
  XMarkIcon,
} from "@heroicons/react/20/solid";
import type { DeliverableType, Tra, TraDeliverable } from "@arbor/shared";

type Props = {
  tra: Tra;
  deliverables: TraDeliverable[];
  deliverableTypes: DeliverableType[];
  pending: boolean;
  onSubmit: () => void;
  onApprove: () => void;
  onReject: () => void;
  onConvert: () => void;
};

export default function StepDocument({
  tra,
  deliverables,
  deliverableTypes,
  pending,
  onSubmit,
  onApprove,
  onReject,
  onConvert,
}: Props) {
  const typeName = new Map(deliverableTypes.map((t) => [t.id, t.name]));
  const total = deliverables.reduce((acc, d) => acc + (d.estimated_hours || 0), 0);

  const canSubmit = tra.status === "draft";
  const canApproveOrReject = tra.status === "submitted";
  const canConvert = tra.status === "approved";
  const isLocked = tra.status === "converted";

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="border-border bg-background flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
        <p className="text-muted-foreground text-xs">
          {isLocked
            ? "This TRA has been converted to a project."
            : tra.status === "rejected"
              ? "This TRA was rejected. Edit the deliverables and resubmit if you want another review."
              : "Generate a PDF, send for approval, or convert an approved TRA to a project."}
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
              Submit for approval
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
            Convert to Project
          </button>
        </div>
      </div>

      {/* Printable preview */}
      <div className="border-border bg-background rounded-xl border p-8 print:border-0 print:shadow-none">
        <div className="mx-auto max-w-3xl">
          <div className="border-border flex items-start justify-between gap-4 border-b pb-4">
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide">
                Training Request Assessment
              </p>
              <h2 className="text-foreground mt-1 text-xl font-semibold">{tra.project_name}</h2>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Generated {new Date().toLocaleDateString()}
              </p>
            </div>
            <span className="bg-surface text-muted-foreground inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize">
              {tra.status}
            </span>
          </div>

          <section className="mt-6">
            <h3 className="text-foreground mb-3 text-sm font-semibold">Project information</h3>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              <Field label="Requesting department" value={tra.requesting_department} />
              <Field label="Stakeholder" value={tra.stakeholder_name} />
              <Field label="Stakeholder email" value={tra.stakeholder_email} />
              <Field label="Target audience" value={tra.target_audience} />
              <Field label="Urgency" value={tra.urgency} />
              <Field label="Status" value={tra.status} />
            </dl>
          </section>

          {tra.description && (
            <section className="mt-6">
              <h3 className="text-foreground mb-2 text-sm font-semibold">Description</h3>
              <p className="text-foreground whitespace-pre-wrap text-sm">{tra.description}</p>
            </section>
          )}

          {tra.business_justification && (
            <section className="mt-6">
              <h3 className="text-foreground mb-2 text-sm font-semibold">Business justification</h3>
              <p className="text-foreground whitespace-pre-wrap text-sm">
                {tra.business_justification}
              </p>
            </section>
          )}

          <section className="mt-6">
            <h3 className="text-foreground mb-2 text-sm font-semibold">Deliverables</h3>
            {deliverables.length === 0 ? (
              <p className="text-muted-foreground text-sm">No deliverables.</p>
            ) : (
              <div className="border-border overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="border-border bg-surface border-b">
                    <tr>
                      <th className="text-muted-foreground px-3 py-2 text-left text-xs font-medium">
                        Deliverable
                      </th>
                      <th className="text-muted-foreground px-3 py-2 text-left text-xs font-medium">
                        Type
                      </th>
                      <th className="text-muted-foreground px-3 py-2 text-right text-xs font-medium">
                        Seat hrs
                      </th>
                      <th className="text-muted-foreground px-3 py-2 text-right text-xs font-medium">
                        Qty
                      </th>
                      <th className="text-muted-foreground px-3 py-2 text-right text-xs font-medium">
                        ×
                      </th>
                      <th className="text-muted-foreground px-3 py-2 text-right text-xs font-medium">
                        Hours
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-border divide-y">
                    {deliverables.map((d) => (
                      <tr key={d.id}>
                        <td className="text-foreground px-3 py-2 text-sm">{d.name}</td>
                        <td className="text-muted-foreground px-3 py-2 text-xs">
                          {typeName.get(d.deliverable_type_id) ?? "—"}
                        </td>
                        <td className="text-foreground px-3 py-2 text-right text-xs tabular-nums">
                          {d.seat_time_hours.toFixed(1)}
                        </td>
                        <td className="text-foreground px-3 py-2 text-right text-xs tabular-nums">
                          {d.quantity}
                        </td>
                        <td className="text-foreground px-3 py-2 text-right text-xs tabular-nums">
                          {d.complexity_multiplier.toFixed(2)}
                        </td>
                        <td className="text-foreground px-3 py-2 text-right text-xs font-semibold tabular-nums">
                          {d.estimated_hours.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="border-border mt-3 flex items-center justify-end gap-3 border-t pt-3">
              <span className="text-muted-foreground text-xs">Total estimated hours</span>
              <span className="text-foreground text-lg font-semibold tabular-nums">
                {total.toFixed(1)}
              </span>
            </div>
          </section>

          {tra.adjustments_notes && (
            <section className="mt-6">
              <h3 className="text-foreground mb-2 text-sm font-semibold">
                Adjustments &amp; assumptions
              </h3>
              <p className="text-foreground whitespace-pre-wrap text-sm">{tra.adjustments_notes}</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs uppercase tracking-wide">{label}</dt>
      <dd className="text-foreground mt-0.5 text-sm capitalize">{value ?? "—"}</dd>
    </div>
  );
}
