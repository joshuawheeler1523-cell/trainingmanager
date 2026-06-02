import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import BillingControls from "./billing-controls";

export const metadata = { title: "Billing" };

export default async function ArborBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; agency?: string }>;
}) {
  const params = await searchParams;
  const admin = createAdminClient();

  let invoiceQuery = admin
    .from("arbor_invoices")
    .select(
      "id, invoice_number, agency_id, period_start, period_end, total_cents, status, issued_at, paid_at, due_at",
    )
    .order("issued_at", { ascending: false })
    .limit(200);
  if (params.status) invoiceQuery = invoiceQuery.eq("status", params.status as never);
  if (params.agency) invoiceQuery = invoiceQuery.eq("agency_id", params.agency);

  const [{ data: invoices }, { data: agencies }] = await Promise.all([
    invoiceQuery,
    admin.from("agencies").select("id, name").order("name"),
  ]);

  const agencyNameById = new Map((agencies ?? []).map((a) => [a.id, a.name]));

  const totals = (invoices ?? []).reduce<Record<string, number>>((acc, i) => {
    acc[i.status] = (acc[i.status] ?? 0) + i.total_cents;
    return acc;
  }, {});

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-foreground text-2xl font-bold">Billing</h1>
        <p className="text-muted-foreground mt-1 text-sm">Cross-platform invoice operations.</p>
      </header>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Kpi label="Sent (outstanding)" value={formatCents(totals["sent"] ?? 0)} />
        <Kpi label="Overdue" value={formatCents(totals["overdue"] ?? 0)} tone="warn" />
        <Kpi label="Paid (in view)" value={formatCents(totals["paid"] ?? 0)} />
        <Kpi label="Draft" value={formatCents(totals["draft"] ?? 0)} />
      </div>

      {/* Run-cron card */}
      <BillingControls />

      {/* Filter form */}
      <form className="border-border bg-background flex flex-wrap items-end gap-3 rounded-xl border p-4 text-sm">
        <div>
          <label htmlFor="status" className="text-foreground mb-1 block text-xs font-medium">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={params.status ?? ""}
            className="border-input bg-background text-foreground rounded-md border px-3 py-1.5 text-sm"
          >
            <option value="">All</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="overdue">Overdue</option>
            <option value="paid">Paid</option>
            <option value="void">Void</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div>
          <label htmlFor="agency" className="text-foreground mb-1 block text-xs font-medium">
            Agency
          </label>
          <select
            id="agency"
            name="agency"
            defaultValue={params.agency ?? ""}
            className="border-input bg-background text-foreground rounded-md border px-3 py-1.5 text-sm"
          >
            <option value="">All</option>
            {(agencies ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm font-medium hover:opacity-90"
        >
          Filter
        </button>
        {(params.status || params.agency) && (
          <Link
            href="/arbor/billing"
            className="text-muted-foreground hover:text-foreground text-xs underline"
          >
            Clear
          </Link>
        )}
      </form>

      {/* Invoices table */}
      <section className="border-border bg-background overflow-hidden rounded-xl border">
        <div className="border-border border-b px-5 py-3">
          <h2 className="text-foreground text-base font-bold">
            Invoices ({(invoices ?? []).length.toString()})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface text-muted-foreground border-border border-b text-xs uppercase">
              <tr>
                <th className="px-5 py-2.5 text-left font-medium">Number</th>
                <th className="px-5 py-2.5 text-left font-medium">Agency</th>
                <th className="px-5 py-2.5 text-left font-medium">Period</th>
                <th className="px-5 py-2.5 text-right font-medium">Total</th>
                <th className="px-5 py-2.5 text-left font-medium">Issued</th>
                <th className="px-5 py-2.5 text-left font-medium">Due</th>
                <th className="px-5 py-2.5 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {(invoices ?? []).length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-muted-foreground p-8 text-center italic">
                    No invoices match.
                  </td>
                </tr>
              ) : (
                (invoices ?? []).map((i) => (
                  <tr key={i.id} className="hover:bg-surface">
                    <td className="text-foreground px-5 py-2 font-mono text-xs">
                      <Link href={`/agency/billing/${i.id}`} className="hover:text-primary">
                        {i.invoice_number}
                      </Link>
                    </td>
                    <td className="text-muted-foreground px-5 py-2 text-xs">
                      <Link href={`/arbor/agencies/${i.agency_id}`} className="hover:text-primary">
                        {agencyNameById.get(i.agency_id) ?? "Unknown"}
                      </Link>
                    </td>
                    <td className="text-muted-foreground px-5 py-2 text-xs tabular-nums">
                      {i.period_start} → {i.period_end}
                    </td>
                    <td className="text-foreground px-5 py-2 text-right font-semibold tabular-nums">
                      {formatCents(i.total_cents)}
                    </td>
                    <td className="text-foreground px-5 py-2 text-xs tabular-nums">
                      {i.issued_at.slice(0, 10)}
                    </td>
                    <td className="text-foreground px-5 py-2 text-xs tabular-nums">{i.due_at}</td>
                    <td className="px-5 py-2 text-xs capitalize">
                      <StatusBadge status={i.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className="border-border bg-background rounded-xl border p-4">
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <p
        className="mt-2 text-2xl font-bold tabular-nums"
        style={{ color: tone === "warn" ? "var(--destructive)" : "var(--foreground)" }}
      >
        {value}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-slate-200 text-slate-700",
    sent: "bg-info-bg text-info",
    paid: "bg-success-bg text-success",
    overdue: "bg-danger-bg text-danger",
    void: "bg-slate-100 text-slate-500 line-through",
    cancelled: "bg-slate-100 text-slate-500",
  };
  const cls = map[status] ?? "bg-slate-100 text-slate-600";
  return <span className={`rounded px-2 py-0.5 ${cls}`}>{status}</span>;
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
