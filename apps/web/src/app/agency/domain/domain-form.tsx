"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  removeAgencyDomainAction,
  setAgencyDomainAction,
  verifyAgencyDomainAction,
} from "./actions";

const fieldClass =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export default function DomainForm({
  activeDomain,
  pendingDomain,
}: {
  activeDomain: string | null;
  pendingDomain: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [domain, setDomain] = useState(pendingDomain ?? activeDomain ?? "");

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await setAgencyDomainAction({ domain });
      if (result.ok) {
        toast.success(
          result.data.degraded
            ? "Domain saved. Vercel API not configured — verification will be skipped."
            : "Domain registered. Configure DNS, then verify below.",
        );
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  const handleVerify = () => {
    startTransition(async () => {
      const result = await verifyAgencyDomainAction();
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      if (result.data.verified) {
        toast.success("Domain verified! 🎉");
        router.refresh();
      } else if (result.data.degraded) {
        toast.error("Vercel API isn't configured — can't verify.");
      } else {
        toast.error(
          `Not verified yet (${result.data.reason ?? "pending"}). Try again in a minute.`,
        );
      }
    });
  };

  const handleRemove = () => {
    if (!confirm("Remove the custom domain? Users will need to use the default Arbor URL.")) return;
    startTransition(async () => {
      const result = await removeAgencyDomainAction();
      if (result.ok) {
        toast.success("Domain removed");
        setDomain("");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  return (
    <section className="border-border bg-background space-y-4 rounded-xl border p-5">
      <h2 className="text-foreground text-base font-bold">
        {activeDomain || pendingDomain ? "Update domain" : "Add a domain"}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="domain" className="text-foreground mb-1 block text-sm font-medium">
            Hostname
          </label>
          <input
            id="domain"
            type="text"
            required
            value={domain}
            onChange={(e) => {
              setDomain(e.target.value);
            }}
            placeholder="app.your-firm.com"
            className={fieldClass}
          />
          <p className="text-muted-foreground mt-1 text-xs">
            Lowercase, no protocol or path. Subdomains (<code>app.firm.com</code>) and apex domains
            (<code>firm.com</code>) are both supported.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={pending || !domain.trim()}
            className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Saving…" : activeDomain || pendingDomain ? "Update" : "Save & continue"}
          </button>

          {(pendingDomain || activeDomain) && (
            <button
              type="button"
              onClick={handleVerify}
              disabled={pending}
              className="border-border text-foreground hover:bg-surface rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {pending ? "Checking…" : "Verify DNS"}
            </button>
          )}

          {(pendingDomain || activeDomain) && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={pending}
              className="text-muted-foreground hover:text-foreground ml-auto text-xs underline"
            >
              Remove domain
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
