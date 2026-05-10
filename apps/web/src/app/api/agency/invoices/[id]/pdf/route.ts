import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgencyId } from "@/lib/auth/agency";
import InvoicePdf, { type InvoiceLineItem } from "@/components/pdf/invoice-pdf";

// GET /api/agency/invoices/[id]/pdf — streams an invoice PDF.
// Auth: caller must be an agency_admin of the agency that owns the invoice
// (RLS on arbor_invoices enforces this).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const callerAgencyId = await getCurrentAgencyId();
  if (!callerAgencyId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { data: invoice } = await supabase
    .from("arbor_invoices")
    .select(
      "id, invoice_number, agency_id, period_start, period_end, issued_at, due_at, total_cents, line_items, notes",
    )
    .eq("id", id)
    .maybeSingle();

  if (!invoice) {
    return new NextResponse("Not Found", { status: 404 });
  }
  // Defense in depth: even though RLS gates SELECT, double-check the agency.
  if (invoice.agency_id !== callerAgencyId) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { data: agency } = await supabase
    .from("agencies")
    .select("name, billing_email, billing_address")
    .eq("id", invoice.agency_id)
    .maybeSingle();

  // Arbor billing entity comes from env so we don't have to hardcode it.
  // Env vars are typed as string in this project; ?? guards against bracket-access
  // returning undefined at runtime regardless of TS thinking they're set.
  const arborName: string = process.env["ARBOR_BILLING_NAME"] || "Arbor";
  const arborAddress: string =
    process.env["ARBOR_BILLING_ADDRESS"] || "Arbor Inc.\n[Configure ARBOR_BILLING_ADDRESS env var]";
  const arborEmail: string = process.env["ARBOR_BILLING_EMAIL"] || "billing@arbor.app";
  const arborEin: string | null = process.env["ARBOR_BILLING_EIN"] || null;
  const paymentInstructions: string =
    process.env["ARBOR_BILLING_PAYMENT_INSTRUCTIONS"] ||
    `Please remit payment via ACH to the bank account on file. Reference the invoice number with your payment. For questions, email ${arborEmail}.`;

  const buffer = await renderToBuffer(
    InvoicePdf({
      invoiceNumber: invoice.invoice_number,
      issuedAt: invoice.issued_at.slice(0, 10),
      dueAt: invoice.due_at,
      periodStart: invoice.period_start,
      periodEnd: invoice.period_end,
      totalCents: invoice.total_cents,
      lineItems: (invoice.line_items as unknown as InvoiceLineItem[] | null) ?? [],
      agencyName: agency?.name ?? "Agency",
      agencyBillingEmail: agency?.billing_email ?? null,
      agencyBillingAddress: agency?.billing_address ?? null,
      arborName,
      arborAddress,
      arborEmail,
      arborEin,
      paymentInstructions,
      notes: invoice.notes,
    }),
  );

  const filename = `${invoice.invoice_number}.pdf`;
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, max-age=0, no-cache",
    },
  });
}
