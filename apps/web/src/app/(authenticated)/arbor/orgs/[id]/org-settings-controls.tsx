"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  deleteOrgAction,
  reassignOrgAction,
  suspendOrgAction,
  unsuspendOrgAction,
} from "../actions";

const fieldClass =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export default function OrgSettingsControls({
  orgId,
  orgName,
  currentAgencyId,
  agencies,
  isSuspended,
}: {
  orgId: string;
  orgName: string;
  currentAgencyId: string | null;
  agencies: { id: string; name: string }[];
  isSuspended: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [agencyId, setAgencyId] = useState<string>(currentAgencyId ?? "");
  const [reason, setReason] = useState("");

  const handleReassign = () => {
    const newId: string | null = agencyId === "" ? null : agencyId;
    if (newId === currentAgencyId) {
      toast.error("Same agency — nothing to change.");
      return;
    }
    if (
      !confirm(
        newId === null
          ? `Detach ${orgName} from its current agency? It becomes a standalone org.`
          : `Move ${orgName} to a different agency? Its agency_admin gains read access immediately.`,
      )
    )
      return;
    startTransition(async () => {
      const result = await reassignOrgAction({ orgId, agencyId: newId });
      if (result.ok) {
        toast.success("Org reassigned");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  const handleSuspend = () => {
    if (!reason.trim()) {
      toast.error("Add a reason before suspending");
      return;
    }
    if (!confirm(`Suspend ${orgName}? Members lose workspace access immediately.`)) return;
    startTransition(async () => {
      const result = await suspendOrgAction({ orgId, reason });
      if (result.ok) {
        toast.success("Org suspended");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  const handleUnsuspend = () => {
    if (!confirm(`Restore access for ${orgName}?`)) return;
    startTransition(async () => {
      const result = await unsuspendOrgAction({ orgId });
      if (result.ok) {
        toast.success("Org restored");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  const handleDelete = () => {
    const typed = prompt(
      `Permanently delete ${orgName} and ALL its tenant data (instructors, classes, projects, work intake, members, audit log). Type the org name to confirm:`,
    );
    if (typed !== orgName) {
      if (typed != null) toast.error("Name didn't match. Nothing deleted.");
      return;
    }
    startTransition(async () => {
      const result = await deleteOrgAction({ orgId });
      if (!result.ok) toast.error(result.error.message);
    });
  };

  return (
    <section className="space-y-6">
      {/* Reassign */}
      <div className="border-border bg-background space-y-3 rounded-xl border p-5">
        <h2 className="text-foreground text-base font-bold">Parent agency</h2>
        <p className="text-muted-foreground text-xs">
          Move this org under a different agency, or detach to standalone.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1">
            <select
              value={agencyId}
              onChange={(e) => {
                setAgencyId(e.target.value);
              }}
              className={fieldClass}
            >
              <option value="">Standalone (no agency)</option>
              {agencies.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={handleReassign}
            disabled={pending}
            className="bg-primary text-primary-foreground rounded-md px-3 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Reassigning…" : "Reassign"}
          </button>
        </div>
      </div>

      {/* Danger zone */}
      <div className="border-destructive/30 bg-destructive/5 space-y-4 rounded-xl border p-5">
        <h2 className="text-foreground text-base font-bold">Danger zone</h2>

        {isSuspended ? (
          <div>
            <p className="text-foreground text-sm">This org is currently suspended.</p>
            <button
              type="button"
              onClick={handleUnsuspend}
              disabled={pending}
              className="border-border text-foreground hover:bg-surface mt-2 rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              {pending ? "Restoring…" : "Restore access"}
            </button>
          </div>
        ) : (
          <div>
            <p className="text-foreground text-sm">Suspend this org.</p>
            <input
              type="text"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
              }}
              placeholder="Reason (shown to suspended members)"
              className={`${fieldClass} mt-2`}
            />
            <button
              type="button"
              onClick={handleSuspend}
              disabled={pending || !reason.trim()}
              className="bg-warning mt-2 rounded-md px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Suspending…" : "Suspend org"}
            </button>
          </div>
        )}

        <hr className="border-destructive/20" />

        <div>
          <p className="text-foreground text-sm font-medium">Delete this org</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Permanent. Cascades to instructors, classes, projects, work intake, members, audit log,
            data exports, etc. Use with extreme care.
          </p>
          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            className="bg-destructive text-destructive-foreground mt-2 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            Delete org…
          </button>
        </div>
      </div>
    </section>
  );
}
