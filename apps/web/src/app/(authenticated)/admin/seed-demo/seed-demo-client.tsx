"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SparklesIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import { seedDemoOrg, type SeedResult } from "./actions";

export default function SeedDemoClient() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SeedResult | null>(null);

  function run() {
    setResult(null);
    startTransition(async () => {
      const res = await seedDemoOrg();
      setResult(res);
      if (res.ok) {
        toast.success("Demo organization is ready", {
          description:
            "Switch to Riverside Memorial Hospital from the org switcher in the top bar.",
        });
        router.refresh();
      } else {
        toast.error("Seed failed", { description: res.error });
      }
    });
  }

  return (
    <div className="border-border bg-background mx-auto max-w-2xl rounded-xl border p-6">
      <div className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: "var(--primary)", color: "var(--highlight)" }}
        >
          <SparklesIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-foreground font-serif text-xl tracking-tight">
            Riverside Memorial Hospital
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            One click creates (or recreates) a full-data demo organization with ~12 instructors, 8
            skills, 5 classes, the entire allocation tree, 4 TRAs, 3 projects with tasks &amp;
            milestones, an active training implementation, and a couple of support tickets. After it
            runs, switch to the new org from the org switcher in the top bar.
          </p>
          <ul className="text-muted-foreground mt-3 list-disc pl-5 text-xs">
            <li>Idempotent: running again drops and re-seeds the demo org.</li>
            <li>You become the org_admin automatically.</li>
            <li>Other orgs you belong to are untouched.</li>
          </ul>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={pending}
          className="bg-primary text-primary-foreground inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? (
            <ArrowPathIcon className="h-4 w-4 animate-spin" />
          ) : (
            <SparklesIcon className="h-4 w-4" />
          )}
          {pending ? "Seeding…" : result?.ok ? "Reset & re-seed" : "Seed demo organization"}
        </button>
        {result?.ok && (
          <p className="text-muted-foreground text-xs">Created. Use the org switcher to jump in.</p>
        )}
      </div>

      {result && !result.ok && (
        <div
          role="alert"
          className="mt-4 rounded-md border px-3 py-2 text-sm"
          style={{ borderColor: "var(--destructive)", color: "var(--destructive)" }}
        >
          <p className="font-medium">Seed failed</p>
          <p className="mt-1 break-all text-xs opacity-90">{result.error}</p>
          <p className="mt-2 text-xs opacity-90">
            Most common cause: <code>SUPABASE_SERVICE_ROLE_KEY</code> isn&apos;t set. Add it to{" "}
            <code>.env.local</code> (no <code>NEXT_PUBLIC_</code> prefix) and to Vercel env vars.
          </p>
        </div>
      )}

      {result?.ok && (
        <div className="border-border mt-4 rounded-md border p-4 text-xs">
          <p className="text-foreground mb-1 font-medium">Seeded:</p>
          <ul className="text-muted-foreground space-y-0.5">
            {Object.entries(result.counts).map(([k, v]) => (
              <li key={k}>
                {v} {k}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
