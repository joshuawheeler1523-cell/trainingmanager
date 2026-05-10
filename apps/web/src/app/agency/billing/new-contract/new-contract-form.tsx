"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { createClientContractAction } from "../actions";

const fieldClass =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

const TIERS = [
  { value: "small", label: "Small (< 25 users · ~$30k retail)" },
  { value: "medium", label: "Medium (25–100 users · ~$50k retail)" },
  { value: "large", label: "Large (100–500 users · ~$75k retail)" },
  { value: "enterprise", label: "Enterprise (500+ users · custom retail)" },
] as const;

export default function NewContractForm({
  clientOrgs,
}: {
  clientOrgs: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [orgId, setOrgId] = useState(clientOrgs[0]?.id ?? "");
  const [pricingTier, setPricingTier] = useState<"small" | "medium" | "large" | "enterprise">(
    "medium",
  );
  const [annualValueDollars, setAnnualValueDollars] = useState("50000");
  const [revShareOverridePct, setRevShareOverridePct] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const oneYearOut = new Date();
  oneYearOut.setFullYear(oneYearOut.getFullYear() + 1);
  const [contractStart, setContractStart] = useState(today);
  const [contractEnd, setContractEnd] = useState(oneYearOut.toISOString().slice(0, 10));
  const [status, setStatus] = useState<"trial" | "active">("trial");
  const [notes, setNotes] = useState("");

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const cents = Math.round(parseFloat(annualValueDollars) * 100);
    if (!Number.isFinite(cents) || cents < 0) {
      toast.error("Invalid annual value");
      return;
    }
    let sharePct: number | null = null;
    if (revShareOverridePct.trim() !== "") {
      const pct = parseFloat(revShareOverridePct);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        toast.error("Rev share % must be between 0 and 100");
        return;
      }
      sharePct = Math.round(pct * 100);
    }

    startTransition(async () => {
      const result = await createClientContractAction({
        orgId,
        pricingTier,
        annualContractValueCents: cents,
        revenueSharePct: sharePct,
        contractStart,
        contractEnd: contractEnd === "" ? null : contractEnd,
        status,
        notes,
      });
      if (result.ok) {
        toast.success("Contract created");
        router.push("/agency/billing");
      } else {
        toast.error(result.error.message);
      }
    });
  };

  if (clientOrgs.length === 0) {
    return (
      <div className="border-border bg-surface rounded-lg border border-dashed p-6 text-center text-sm">
        <p className="text-muted-foreground">
          You haven&apos;t provisioned any client orgs yet. Add one first from the{" "}
          <a href="/agency" className="text-primary hover:underline">
            agency dashboard
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="org" className="text-foreground mb-1 block text-sm font-medium">
          Client org *
        </label>
        <select
          id="org"
          value={orgId}
          onChange={(e) => {
            setOrgId(e.target.value);
          }}
          required
          className={fieldClass}
        >
          {clientOrgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="tier" className="text-foreground mb-1 block text-sm font-medium">
          Pricing tier *
        </label>
        <select
          id="tier"
          value={pricingTier}
          onChange={(e) => {
            setPricingTier(e.target.value as typeof pricingTier);
          }}
          className={fieldClass}
        >
          {TIERS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="value" className="text-foreground mb-1 block text-sm font-medium">
            Annual contract value (USD) *
          </label>
          <input
            id="value"
            type="number"
            min="0"
            step="0.01"
            required
            value={annualValueDollars}
            onChange={(e) => {
              setAnnualValueDollars(e.target.value);
            }}
            className={fieldClass}
          />
          <p className="text-muted-foreground mt-1 text-xs">
            What the consultant invoiced the hospital for the year.
          </p>
        </div>
        <div>
          <label htmlFor="rev-share" className="text-foreground mb-1 block text-sm font-medium">
            Rev share % (override)
          </label>
          <input
            id="rev-share"
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={revShareOverridePct}
            onChange={(e) => {
              setRevShareOverridePct(e.target.value);
            }}
            placeholder="leave blank for agency default"
            className={fieldClass}
          />
          <p className="text-muted-foreground mt-1 text-xs">
            Default is your agency&apos;s configured rate (typically 30%).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="start" className="text-foreground mb-1 block text-sm font-medium">
            Contract start *
          </label>
          <input
            id="start"
            type="date"
            required
            value={contractStart}
            onChange={(e) => {
              setContractStart(e.target.value);
            }}
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="end" className="text-foreground mb-1 block text-sm font-medium">
            Contract end
          </label>
          <input
            id="end"
            type="date"
            value={contractEnd}
            onChange={(e) => {
              setContractEnd(e.target.value);
            }}
            className={fieldClass}
          />
          <p className="text-muted-foreground mt-1 text-xs">Blank = open-ended.</p>
        </div>
      </div>

      <div>
        <label htmlFor="status" className="text-foreground mb-1 block text-sm font-medium">
          Initial status
        </label>
        <select
          id="status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as typeof status);
          }}
          className={fieldClass}
        >
          <option value="trial">Trial (no rev share owed)</option>
          <option value="active">Active (billable from contract start)</option>
        </select>
      </div>

      <div>
        <label htmlFor="notes" className="text-foreground mb-1 block text-sm font-medium">
          Notes (optional)
        </label>
        <textarea
          id="notes"
          rows={3}
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
          }}
          className={fieldClass}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create contract"}
        </button>
        <Link
          href="/agency/billing"
          className="text-muted-foreground hover:text-foreground text-sm"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
