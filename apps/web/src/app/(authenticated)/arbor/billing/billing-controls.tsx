"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { runMonthlyInvoicesAction } from "./actions";

const fieldClass =
  "border-input bg-background text-foreground rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export default function BillingControls() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Default to last calendar month
  const now = new Date();
  const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthEnd = new Date(firstOfThisMonth);
  lastMonthEnd.setDate(lastMonthEnd.getDate() - 1);
  const lastMonthStart = new Date(lastMonthEnd.getFullYear(), lastMonthEnd.getMonth(), 1);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const [periodStart, setPeriodStart] = useState(fmt(lastMonthStart));
  const [periodEnd, setPeriodEnd] = useState(fmt(lastMonthEnd));
  const [results, setResults] = useState<
    Array<{
      agency_id: string;
      invoice_id: string | null;
      invoice_number: string | null;
      total_cents: number | null;
      line_count: number | null;
      skipped: boolean;
      skip_reason: string | null;
    }>
  >([]);

  const handleRun = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (
      !confirm(
        `Generate invoices for every agency with active contracts in ${periodStart} → ${periodEnd}? Idempotent — already-invoiced periods are skipped.`,
      )
    )
      return;
    startTransition(async () => {
      const result = await runMonthlyInvoicesAction({ periodStart, periodEnd });
      if (result.ok) {
        setResults(result.data.rows);
        const created = result.data.rows.filter((r) => !r.skipped).length;
        const skipped = result.data.rows.filter((r) => r.skipped).length;
        toast.success(`${created.toString()} created, ${skipped.toString()} skipped`);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  return (
    <section className="border-border bg-background space-y-4 rounded-xl border p-5">
      <div>
        <h2 className="text-foreground text-base font-bold">Generate monthly invoices</h2>
        <p className="text-muted-foreground mt-1 text-xs">
          Manually run the monthly invoice cron for a specific period. Useful for ad-hoc runs
          (off-schedule billing, true-ups). The function is idempotent: agencies with an existing
          invoice for the same period are skipped.
        </p>
      </div>
      <form onSubmit={handleRun} className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="period-start" className="text-foreground mb-1 block text-xs font-medium">
            Period start
          </label>
          <input
            id="period-start"
            type="date"
            value={periodStart}
            onChange={(e) => {
              setPeriodStart(e.target.value);
            }}
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="period-end" className="text-foreground mb-1 block text-xs font-medium">
            Period end
          </label>
          <input
            id="period-end"
            type="date"
            value={periodEnd}
            onChange={(e) => {
              setPeriodEnd(e.target.value);
            }}
            className={fieldClass}
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Running…" : "Run cron"}
        </button>
      </form>

      {results.length > 0 && (
        <div className="border-border mt-4 overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-surface text-muted-foreground border-border border-b text-xs uppercase">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Agency</th>
                <th className="px-3 py-2 text-left font-medium">Result</th>
                <th className="px-3 py-2 text-left font-medium">Invoice</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {results.map((r) => (
                <tr key={r.agency_id}>
                  <td className="text-muted-foreground px-3 py-2 font-mono text-xs">
                    {r.agency_id.slice(0, 8)}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {r.skipped ? (
                      <span className="text-muted-foreground">{r.skip_reason ?? "skipped"}</span>
                    ) : (
                      <span className="text-success font-medium">created</span>
                    )}
                  </td>
                  <td className="text-foreground px-3 py-2 font-mono text-xs">
                    {r.invoice_number ?? "—"}
                  </td>
                  <td className="text-foreground px-3 py-2 text-right text-xs tabular-nums">
                    {r.total_cents != null
                      ? new Intl.NumberFormat("en-US", {
                          style: "currency",
                          currency: "USD",
                          maximumFractionDigits: 0,
                        }).format(r.total_cents / 100)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
