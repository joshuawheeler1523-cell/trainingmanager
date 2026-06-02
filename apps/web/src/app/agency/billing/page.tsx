import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgencyId } from "@/lib/auth/agency";

const INVOICE_STATUS_BADGE: Record<string, string> = {
  draft: "bg-slate-200 text-slate-700",
  sent: "bg-info-bg text-info",
  paid: "bg-success-bg text-success",
  overdue: "bg-danger-bg text-danger",
  void: "bg-slate-100 text-slate-500 line-through",
  cancelled: "bg-slate-100 text-slate-500",
};

export default async function AgencyBillingPage() {
  const supabase = await createClient();
  const agencyId = await getCurrentAgencyId();
  if (!agencyId) return null;

  const [{ data: contracts }, { data: invoices }, { data: agency }] = await Promise.all([
    supabase
      .from("client_contracts")
      .select(
        "id, org_id, pricing_tier, annual_contract_value_cents, revenue_share_pct, contract_start, contract_end, status, organizations!inner(name, slug)",
      )
      .eq("agency_id", agencyId)
      .order("status")
      .order("contract_start", { ascending: false }),
    supabase
      .from("arbor_invoices")
      .select(
        "id, invoice_number, period_start, period_end, issued_at, due_at, total_cents, status, paid_at",
      )
      .eq("agency_id", agencyId)
      .order("issued_at", { ascending: false })
      .limit(50),
    supabase
      .from("agencies")
      .select("default_revenue_share_pct, payment_terms_days, billing_email, billing_address")
      .eq("id", agencyId)
      .maybeSingle(),
  ]);

  const contractList = contracts ?? [];
  const invoiceList = invoices ?? [];
  const defaultSharePct = (agency?.default_revenue_share_pct ?? 3000) / 100; // basis pts → %

  // Compute current period (current calendar month) rev share owed across active contracts.
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const periodDays = Math.round(
    (periodEnd.getTime() - periodStart.getTime()) / (24 * 60 * 60 * 1000) + 1,
  );
  let periodOwedCents = 0;
  for (const c of contractList) {
    if (c.status !== "active") continue;
    const sharePct = c.revenue_share_pct ?? agency?.default_revenue_share_pct ?? 3000;
    const periodShare = Math.floor(
      (c.annual_contract_value_cents * sharePct * periodDays) / (10000 * 365),
    );
    periodOwedCents += periodShare;
  }

  const activeContracts = contractList.filter((c) => c.status === "active").length;
  const trialContracts = contractList.filter((c) => c.status === "trial").length;

  const unpaidInvoices = invoiceList.filter((i) => i.status === "sent" || i.status === "overdue");
  const totalUnpaidCents = unpaidInvoices.reduce((s, i) => s + i.total_cents, 0);

  return (
    <div className="space-y-6 p-6">
      {/* Top KPI strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <KpiCard
          label="Active contracts"
          value={activeContracts.toString()}
          sub={`${trialContracts.toString()} on trial`}
        />
        <KpiCard
          label="This period rev-share owed"
          value={formatCents(periodOwedCents)}
          sub={`${periodStart.toLocaleString("en-US", { month: "short" })} ${periodStart.getDate().toString()} – ${periodEnd.getDate().toString()}`}
        />
        <KpiCard
          label="Unpaid invoices"
          value={unpaidInvoices.length.toString()}
          sub={`${formatCents(totalUnpaidCents)} outstanding`}
          tone={unpaidInvoices.length > 0 ? "warning" : undefined}
        />
        <KpiCard
          label="Default rev-share"
          value={`${defaultSharePct.toFixed(0)}%`}
          sub={`Net ${(agency?.payment_terms_days ?? 30).toString()} payment terms`}
        />
      </div>

      {/* Contracts */}
      <section className="border-border bg-background rounded-xl border">
        <div className="border-border flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-foreground text-base font-bold">Client contracts</h2>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Each row is a deal between your agency and one client org. Trial contracts are not
              billed until activated.
            </p>
          </div>
          <Link
            href="/agency/billing/new-contract"
            className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm font-medium hover:opacity-90"
          >
            + New contract
          </Link>
        </div>
        {contractList.length === 0 ? (
          <div className="text-muted-foreground p-8 text-center text-sm">
            No contracts yet. Provision a client org first via{" "}
            <Link href="/agency" className="text-primary hover:underline">
              the agency dashboard
            </Link>
            , then add a contract here.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface border-border border-b text-xs">
                <tr className="text-muted-foreground">
                  <th className="px-5 py-2.5 text-left font-medium">Client org</th>
                  <th className="px-5 py-2.5 text-left font-medium">Tier</th>
                  <th className="px-5 py-2.5 text-right font-medium">Annual value</th>
                  <th className="px-5 py-2.5 text-right font-medium">Rev share</th>
                  <th className="px-5 py-2.5 text-left font-medium">Period</th>
                  <th className="px-5 py-2.5 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {contractList.map((c) => {
                  type WithOrg = {
                    organizations:
                      | { name: string; slug: string }
                      | { name: string; slug: string }[]
                      | null;
                  };
                  const cx = c as unknown as WithOrg;
                  const orgs = cx.organizations;
                  const orgRow = Array.isArray(orgs) ? orgs[0] : orgs;
                  const orgName = orgRow?.name ?? "(unknown)";
                  const sharePct =
                    (c.revenue_share_pct ?? agency?.default_revenue_share_pct ?? 3000) / 100;
                  return (
                    <tr key={c.id} className="hover:bg-surface">
                      <td className="text-foreground px-5 py-3 font-medium">{orgName}</td>
                      <td className="text-muted-foreground px-5 py-3 capitalize">
                        {c.pricing_tier}
                      </td>
                      <td className="text-foreground px-5 py-3 text-right tabular-nums">
                        {formatCents(c.annual_contract_value_cents)}/yr
                      </td>
                      <td className="text-foreground px-5 py-3 text-right tabular-nums">
                        {sharePct.toFixed(0)}%
                      </td>
                      <td className="text-muted-foreground px-5 py-3 text-xs">
                        {c.contract_start} → {c.contract_end ?? "open"}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                            c.status === "active"
                              ? "bg-success-bg text-success"
                              : c.status === "trial"
                                ? "bg-warning-bg text-warning"
                                : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {c.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Invoices */}
      <section className="border-border bg-background rounded-xl border">
        <div className="border-border border-b px-5 py-4">
          <h2 className="text-foreground text-base font-bold">Invoice history</h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Arbor generates an invoice on the 1st of each month for the prior month&apos;s rev
            share. Click an invoice to view + download the PDF.
          </p>
        </div>
        {invoiceList.length === 0 ? (
          <div className="text-muted-foreground p-8 text-center text-sm">
            No invoices yet. The first one will appear after the first month-end with active
            contracts.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface border-border border-b text-xs">
                <tr className="text-muted-foreground">
                  <th className="px-5 py-2.5 text-left font-medium">Invoice #</th>
                  <th className="px-5 py-2.5 text-left font-medium">Period</th>
                  <th className="px-5 py-2.5 text-left font-medium">Issued</th>
                  <th className="px-5 py-2.5 text-left font-medium">Due</th>
                  <th className="px-5 py-2.5 text-right font-medium">Amount</th>
                  <th className="px-5 py-2.5 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {invoiceList.map((inv) => (
                  <tr key={inv.id} className="hover:bg-surface">
                    <td className="px-5 py-3">
                      <Link
                        href={`/agency/billing/${inv.id}`}
                        className="text-primary font-mono text-xs hover:underline"
                      >
                        {inv.invoice_number}
                      </Link>
                    </td>
                    <td className="text-muted-foreground px-5 py-3 text-xs">
                      {inv.period_start} → {inv.period_end}
                    </td>
                    <td className="text-muted-foreground px-5 py-3 text-xs">
                      {inv.issued_at.slice(0, 10)}
                    </td>
                    <td className="text-muted-foreground px-5 py-3 text-xs">{inv.due_at}</td>
                    <td className="text-foreground px-5 py-3 text-right font-semibold tabular-nums">
                      {formatCents(inv.total_cents)}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                          INVOICE_STATUS_BADGE[inv.status] ?? "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string | undefined;
  tone?: "warning" | undefined;
}) {
  const valueColor = tone === "warning" ? "text-warning" : "text-foreground";
  return (
    <div className="border-border bg-background rounded-xl border p-4">
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <p className={`mt-2 text-2xl font-bold tabular-nums tracking-tight ${valueColor}`}>{value}</p>
      {sub && <p className="text-muted-foreground mt-1 text-xs">{sub}</p>}
    </div>
  );
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
