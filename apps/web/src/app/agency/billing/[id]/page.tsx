import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgencyId } from "@/lib/auth/agency";
import MarkPaidForm from "./mark-paid-form";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const agencyId = await getCurrentAgencyId();
  if (!agencyId) notFound();

  const { data: invoice } = await supabase
    .from("arbor_invoices")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!invoice || invoice.agency_id !== agencyId) notFound();

  // Check whether caller is an Arbor admin (controls the mark-paid UI).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const arborAdminIds = (process.env["ARBOR_ADMIN_USER_IDS"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const isArborAdmin = !!user && arborAdminIds.includes(user.id);

  type LineItem = {
    contract_id: string;
    org_id: string;
    org_name: string;
    pricing_tier: string;
    annual_value_cents: number;
    effective_share_pct: number;
    period_share_cents: number;
  };
  const lineItems = (invoice.line_items as unknown as LineItem[] | null) ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <Link
          href="/agency/billing"
          className="text-muted-foreground hover:text-foreground text-xs"
        >
          ← Back to billing
        </Link>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-foreground text-2xl font-bold">{invoice.invoice_number}</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {invoice.period_start} → {invoice.period_end} · Issued{" "}
              {invoice.issued_at.slice(0, 10)} · Due {invoice.due_at}
            </p>
          </div>
          <div className="text-right">
            <p className="text-foreground text-3xl font-bold tabular-nums">
              {formatCents(invoice.total_cents)}
            </p>
            <span
              className={`mt-2 inline-block rounded px-2 py-0.5 text-xs font-medium ${statusBadge(invoice.status)}`}
            >
              {invoice.status}
            </span>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <a
          href={`/api/agency/invoices/${invoice.id}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="border-border text-foreground hover:bg-surface inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium"
        >
          <ArrowDownTrayIcon className="h-4 w-4" />
          Download PDF
        </a>
      </div>

      <section className="border-border bg-background overflow-hidden rounded-xl border">
        <div className="border-border border-b px-5 py-4">
          <h2 className="text-foreground text-base font-bold">Line items</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface text-muted-foreground border-border border-b text-xs">
              <tr>
                <th className="px-5 py-2.5 text-left font-medium">Client org</th>
                <th className="px-5 py-2.5 text-left font-medium">Tier</th>
                <th className="px-5 py-2.5 text-right font-medium">Annual value</th>
                <th className="px-5 py-2.5 text-right font-medium">Share %</th>
                <th className="px-5 py-2.5 text-right font-medium">Period share</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {lineItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-muted-foreground p-6 text-center text-sm">
                    No line items.
                  </td>
                </tr>
              ) : (
                lineItems.map((item) => (
                  <tr key={item.contract_id}>
                    <td className="text-foreground px-5 py-3 font-medium">{item.org_name}</td>
                    <td className="text-muted-foreground px-5 py-3 capitalize">
                      {item.pricing_tier}
                    </td>
                    <td className="text-foreground px-5 py-3 text-right tabular-nums">
                      {formatCents(item.annual_value_cents)}
                    </td>
                    <td className="text-foreground px-5 py-3 text-right tabular-nums">
                      {(item.effective_share_pct / 100).toFixed(0)}%
                    </td>
                    <td className="text-foreground px-5 py-3 text-right font-semibold tabular-nums">
                      {formatCents(item.period_share_cents)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Payment recorded? */}
      {invoice.status === "paid" ? (
        <section className="border-border bg-success-bg rounded-xl border p-5">
          <p className="text-foreground text-sm font-semibold">Payment recorded</p>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex">
              <dt className="text-muted-foreground w-32">Paid at</dt>
              <dd className="text-foreground">{invoice.paid_at?.slice(0, 10) ?? "—"}</dd>
            </div>
            <div className="flex">
              <dt className="text-muted-foreground w-32">Method</dt>
              <dd className="text-foreground capitalize">{invoice.paid_method ?? "—"}</dd>
            </div>
            {invoice.paid_reference && (
              <div className="flex">
                <dt className="text-muted-foreground w-32">Reference</dt>
                <dd className="text-foreground font-mono text-xs">{invoice.paid_reference}</dd>
              </div>
            )}
            <div className="flex">
              <dt className="text-muted-foreground w-32">Amount</dt>
              <dd className="text-foreground tabular-nums">
                {formatCents(invoice.paid_amount_cents ?? invoice.total_cents)}
              </dd>
            </div>
          </dl>
        </section>
      ) : isArborAdmin ? (
        <MarkPaidForm invoiceId={invoice.id} totalCents={invoice.total_cents} />
      ) : (
        <p className="text-muted-foreground text-xs italic">
          Only Arbor admins can record payments. Send your remittance details to billing@arbor.app
          and we&apos;ll mark this invoice paid.
        </p>
      )}

      {invoice.notes && (
        <section className="border-border bg-surface rounded-lg border p-4">
          <p className="text-muted-foreground mb-1 text-xs font-medium uppercase">Notes</p>
          <p className="text-foreground whitespace-pre-wrap text-sm">{invoice.notes}</p>
        </section>
      )}
    </div>
  );
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function statusBadge(status: string): string {
  const map: Record<string, string> = {
    draft: "bg-slate-200 text-slate-700",
    sent: "bg-info-bg text-info",
    paid: "bg-success-bg text-success",
    overdue: "bg-danger-bg text-danger",
    void: "bg-slate-100 text-slate-500 line-through",
    cancelled: "bg-slate-100 text-slate-500",
  };
  return map[status] ?? "bg-slate-100 text-slate-600";
}
