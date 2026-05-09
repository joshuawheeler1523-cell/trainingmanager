"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { TRA_APPROVAL_TYPE_VALUES, type TraApproval, type TraApprovalType } from "@arbor/shared";
import { saveTraApprovals } from "../actions";
import { SaveBar } from "./form-helpers";

type Row = { name: string; signed_at: string };

const APPROVAL_LABELS: Record<TraApprovalType, string> = {
  sponsor: "Sponsor sign-off",
  budget: "Budget approval",
  id_lead: "Instructional design lead sign-off",
  scope_change: "Scope-change approver",
};

const APPROVAL_HINTS: Record<TraApprovalType, string> = {
  sponsor: "Executive owner who'll defend this work",
  budget: "Whoever signs the funding line",
  id_lead: "Reviews learning design before development starts",
  scope_change: "Anyone changing scope mid-flight needs their OK (date is optional)",
};

type Props = {
  traId: string;
  approvals: TraApproval[];
  disabled: boolean;
};

export default function Step8Approvals({ traId, approvals, disabled }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const initialRows = useMemo<Record<TraApprovalType, Row>>(() => {
    const byType = new Map(approvals.map((a) => [a.approval_type, a]));
    const out = {} as Record<TraApprovalType, Row>;
    for (const t of TRA_APPROVAL_TYPE_VALUES) {
      const existing = byType.get(t);
      out[t] = {
        name: existing?.name ?? "",
        // datetime-local wants YYYY-MM-DDTHH:mm; trim seconds + tz from ISO.
        signed_at: existing?.signed_at ? existing.signed_at.slice(0, 16) : "",
      };
    }
    return out;
  }, [approvals]);

  const [rows, setRows] = useState<Record<TraApprovalType, Row>>(initialRows);

  const dirty = JSON.stringify(rows) !== JSON.stringify(initialRows);

  function setRow(t: TraApprovalType, next: Row) {
    setRows((r) => ({ ...r, [t]: next }));
  }

  function handleSave() {
    startTransition(async () => {
      const payload = TRA_APPROVAL_TYPE_VALUES.flatMap((t) => {
        const row = rows[t];
        // Only persist rows the user actually filled in something for.
        if (!row.name && !row.signed_at) return [];
        return [
          {
            approval_type: t,
            name: row.name || null,
            // Convert datetime-local back to ISO. Browser already gives a
            // local-time string; let the DB store it as timestamptz.
            signed_at: row.signed_at ? new Date(row.signed_at).toISOString() : null,
          },
        ];
      });
      const r = await saveTraApprovals(traId, payload);
      if (r.ok) {
        toast.success("Saved");
        router.refresh();
      } else {
        toast.error(r.error.message);
      }
    });
  }

  function handleDiscard() {
    setRows(initialRows);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <p className="text-muted-foreground text-sm">
        Sign-offs land here. Leave dates blank if approval is pending.
      </p>

      <div className="space-y-2">
        {TRA_APPROVAL_TYPE_VALUES.map((t) => {
          const row = rows[t];
          return (
            <div
              key={t}
              className="border-border bg-background grid grid-cols-1 gap-2 rounded-md border p-3 sm:grid-cols-[1fr_1fr_auto]"
            >
              <div>
                <p className="text-foreground text-xs font-medium">{APPROVAL_LABELS[t]}</p>
                <p className="text-muted-foreground mt-0.5 text-[11px]">{APPROVAL_HINTS[t]}</p>
              </div>
              <input
                type="text"
                placeholder="Approver name"
                value={row.name}
                disabled={disabled}
                onChange={(e) => {
                  setRow(t, { ...row, name: e.target.value });
                }}
                className="border-input bg-background text-foreground rounded-md border px-2 py-1.5 text-sm"
              />
              {t !== "scope_change" ? (
                <input
                  type="datetime-local"
                  value={row.signed_at}
                  disabled={disabled}
                  onChange={(e) => {
                    setRow(t, { ...row, signed_at: e.target.value });
                  }}
                  className="border-input bg-background text-foreground rounded-md border px-2 py-1.5 text-sm"
                />
              ) : (
                <span className="text-muted-foreground self-center text-[11px]">no date</span>
              )}
            </div>
          );
        })}
      </div>

      <SaveBar
        dirty={dirty}
        pending={pending}
        onSave={handleSave}
        onDiscard={handleDiscard}
        disabled={disabled}
      />
    </div>
  );
}
