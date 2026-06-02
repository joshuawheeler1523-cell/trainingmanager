"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  deleteAgencyAction,
  suspendAgencyAction,
  unsuspendAgencyAction,
  updateAgencyAsArborAdminAction,
} from "../actions";

const fieldClass =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export default function AgencySettingsControls({
  agencyId,
  agencyName,
  defaultRevSharePct,
  paymentTermsDays,
  isSuspended,
}: {
  agencyId: string;
  agencyName: string;
  defaultRevSharePct: number;
  paymentTermsDays: number;
  isSuspended: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(agencyName);
  const [revShare, setRevShare] = useState((defaultRevSharePct / 100).toFixed(0));
  const [terms, setTerms] = useState(paymentTermsDays.toString());
  const [suspendReason, setSuspendReason] = useState("");

  const handleSave = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    startTransition(async () => {
      const rev = parseFloat(revShare);
      const t = parseInt(terms, 10);
      const result = await updateAgencyAsArborAdminAction({
        agencyId,
        name,
        revenueSharePct: Number.isFinite(rev) ? Math.round(rev * 100) : undefined,
        paymentTermsDays: Number.isFinite(t) ? t : undefined,
      });
      if (result.ok) {
        toast.success("Saved");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  const handleSuspend = () => {
    if (!suspendReason.trim()) {
      toast.error("Add a reason before suspending");
      return;
    }
    if (!confirm(`Suspend ${agencyName}? Their agency_admins lose access immediately.`)) return;
    startTransition(async () => {
      const result = await suspendAgencyAction({ agencyId, reason: suspendReason });
      if (result.ok) {
        toast.success("Agency suspended");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  const handleUnsuspend = () => {
    if (!confirm(`Restore access for ${agencyName}?`)) return;
    startTransition(async () => {
      const result = await unsuspendAgencyAction({ agencyId });
      if (result.ok) {
        toast.success("Agency restored");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  const handleDelete = () => {
    const typed = prompt(
      `This permanently deletes ${agencyName} and orphans every client org under it (orgs become standalone, NOT deleted). Type the agency name to confirm:`,
    );
    if (typed !== agencyName) {
      if (typed != null) toast.error("Name didn't match. Nothing deleted.");
      return;
    }
    startTransition(async () => {
      const result = await deleteAgencyAction({ agencyId });
      if (!result.ok) toast.error(result.error.message);
    });
  };

  return (
    <section className="space-y-6">
      <form
        onSubmit={handleSave}
        className="border-border bg-background space-y-4 rounded-xl border p-5"
      >
        <h2 className="text-foreground text-base font-bold">Settings</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <label htmlFor="ag-name" className="text-foreground mb-1 block text-sm font-medium">
              Name
            </label>
            <input
              id="ag-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
              }}
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor="rev" className="text-foreground mb-1 block text-sm font-medium">
              Default rev share %
            </label>
            <input
              id="rev"
              type="number"
              step="1"
              min="0"
              max="100"
              value={revShare}
              onChange={(e) => {
                setRevShare(e.target.value);
              }}
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor="terms" className="text-foreground mb-1 block text-sm font-medium">
              Payment terms (days)
            </label>
            <input
              id="terms"
              type="number"
              step="1"
              min="1"
              max="180"
              value={terms}
              onChange={(e) => {
                setTerms(e.target.value);
              }}
              className={fieldClass}
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
      </form>

      {/* Danger zone */}
      <div className="border-destructive/30 bg-destructive/5 space-y-4 rounded-xl border p-5">
        <h2 className="text-foreground text-base font-bold">Danger zone</h2>

        {isSuspended ? (
          <div>
            <p className="text-foreground text-sm">This agency is currently suspended.</p>
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
            <p className="text-foreground text-sm">Suspend this agency.</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Their agency_admins lose access immediately. Client orgs see a suspension page instead
              of their workspace.
            </p>
            <input
              type="text"
              value={suspendReason}
              onChange={(e) => {
                setSuspendReason(e.target.value);
              }}
              placeholder="Reason (shown to suspended users)"
              className={`${fieldClass} mt-2`}
            />
            <button
              type="button"
              onClick={handleSuspend}
              disabled={pending || !suspendReason.trim()}
              className="bg-warning mt-2 rounded-md px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Suspending…" : "Suspend agency"}
            </button>
          </div>
        )}

        <hr className="border-destructive/20" />

        <div>
          <p className="text-foreground text-sm font-medium">Delete this agency</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Permanent. Client orgs are kept (ON DELETE SET NULL on agency_id) but they become
            standalone — verify that&apos;s what you want first. Use with extreme care.
          </p>
          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            className="bg-destructive text-destructive-foreground mt-2 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            Delete agency…
          </button>
        </div>
      </div>
    </section>
  );
}
