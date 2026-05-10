import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    padding: 48,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#1a1a1a",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 32,
  },
  brand: {
    fontSize: 22,
    fontWeight: "bold",
  },
  brandTagline: {
    fontSize: 9,
    color: "#6b7280",
    marginTop: 2,
  },
  billFromBlock: {
    fontSize: 9,
    color: "#374151",
    marginTop: 8,
    lineHeight: 1.4,
  },
  invoiceMetaBlock: {
    alignItems: "flex-end",
  },
  invoiceTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: "row",
    fontSize: 9,
    marginBottom: 2,
  },
  metaLabel: {
    color: "#6b7280",
    width: 80,
    textAlign: "right",
    paddingRight: 8,
  },
  metaValue: {
    fontWeight: "bold",
    minWidth: 100,
  },
  billToHeader: {
    fontSize: 8,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 4,
  },
  billToBody: {
    fontSize: 11,
    fontWeight: "bold",
  },
  billToAddress: {
    fontSize: 9,
    color: "#374151",
    marginTop: 2,
    lineHeight: 1.4,
  },
  table: {
    marginTop: 24,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#e5e7eb",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f9fafb",
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderColor: "#e5e7eb",
    fontSize: 8,
    color: "#6b7280",
    textTransform: "uppercase",
    fontWeight: "bold",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderColor: "#f3f4f6",
  },
  tableRowLast: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  colDescription: { width: "55%" },
  colTier: { width: "15%", textAlign: "left" },
  colShare: { width: "10%", textAlign: "right" },
  colAmount: { width: "20%", textAlign: "right" },
  totals: {
    marginTop: 16,
    alignItems: "flex-end",
  },
  totalRow: {
    flexDirection: "row",
    fontSize: 10,
    paddingVertical: 4,
  },
  totalLabel: {
    color: "#6b7280",
    width: 100,
    textAlign: "right",
    paddingRight: 12,
  },
  totalValue: {
    fontWeight: "bold",
    width: 90,
    textAlign: "right",
  },
  totalGrand: {
    fontSize: 14,
    fontWeight: "bold",
    paddingTop: 6,
    borderTopWidth: 1,
    borderColor: "#1a1a1a",
    marginTop: 6,
  },
  paymentSection: {
    marginTop: 32,
    padding: 16,
    backgroundColor: "#f9fafb",
    borderRadius: 4,
  },
  paymentHeader: {
    fontSize: 8,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
    fontWeight: "bold",
  },
  paymentBody: {
    fontSize: 9,
    color: "#374151",
    lineHeight: 1.5,
  },
  notes: {
    marginTop: 16,
    fontSize: 9,
    color: "#6b7280",
    lineHeight: 1.4,
  },
  footer: {
    position: "absolute",
    bottom: 32,
    left: 48,
    right: 48,
    textAlign: "center",
    fontSize: 8,
    color: "#9ca3af",
  },
});

export interface InvoiceLineItem {
  contract_id: string;
  org_id: string;
  org_name: string;
  pricing_tier: "small" | "medium" | "large" | "enterprise";
  annual_value_cents: number;
  effective_share_pct: number; // basis points
  period_share_cents: number;
}

export interface InvoicePdfProps {
  invoiceNumber: string;
  issuedAt: string; // YYYY-MM-DD
  dueAt: string; // YYYY-MM-DD
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
  totalCents: number;
  lineItems: InvoiceLineItem[];
  // Bill-to: the agency
  agencyName: string;
  agencyBillingEmail?: string | null;
  agencyBillingAddress?: string | null;
  // Bill-from: Arbor (configured via env vars)
  arborName: string;
  arborAddress: string;
  arborEmail: string;
  arborEin?: string | null;
  // Payment instructions (rendered into the highlighted section)
  paymentInstructions: string;
  notes?: string | null;
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function formatDate(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  if (!y || !m || !d) return yyyymmdd;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function InvoicePdf(props: InvoicePdfProps) {
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header: brand on left, invoice meta on right */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.brand}>{props.arborName}</Text>
            <Text style={styles.brandTagline}>Capacity & project management platform</Text>
            <View style={styles.billFromBlock}>
              <Text>{props.arborAddress}</Text>
              <Text>{props.arborEmail}</Text>
              {props.arborEin ? <Text>EIN: {props.arborEin}</Text> : null}
            </View>
          </View>
          <View style={styles.invoiceMetaBlock}>
            <Text style={styles.invoiceTitle}>INVOICE</Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Invoice #</Text>
              <Text style={styles.metaValue}>{props.invoiceNumber}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Issued</Text>
              <Text style={styles.metaValue}>{formatDate(props.issuedAt)}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Due</Text>
              <Text style={styles.metaValue}>{formatDate(props.dueAt)}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Period</Text>
              <Text style={styles.metaValue}>
                {formatDate(props.periodStart)} – {formatDate(props.periodEnd)}
              </Text>
            </View>
          </View>
        </View>

        {/* Bill to */}
        <Text style={styles.billToHeader}>Bill to</Text>
        <Text style={styles.billToBody}>{props.agencyName}</Text>
        {props.agencyBillingAddress ? (
          <Text style={styles.billToAddress}>{props.agencyBillingAddress}</Text>
        ) : null}
        {props.agencyBillingEmail ? (
          <Text style={styles.billToAddress}>{props.agencyBillingEmail}</Text>
        ) : null}

        {/* Line items table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.colDescription}>Client org</Text>
            <Text style={styles.colTier}>Tier</Text>
            <Text style={styles.colShare}>Share</Text>
            <Text style={styles.colAmount}>Amount</Text>
          </View>
          {props.lineItems.length === 0 ? (
            <View style={styles.tableRowLast}>
              <Text style={[styles.colDescription, { color: "#9ca3af", fontStyle: "italic" }]}>
                No active contracts in this period.
              </Text>
            </View>
          ) : (
            props.lineItems.map((item, idx) => {
              const isLast = idx === props.lineItems.length - 1;
              return (
                <View key={item.contract_id} style={isLast ? styles.tableRowLast : styles.tableRow}>
                  <View style={styles.colDescription}>
                    <Text>{item.org_name}</Text>
                    <Text style={{ fontSize: 8, color: "#9ca3af", marginTop: 2 }}>
                      {formatCents(item.annual_value_cents)}/year contract
                    </Text>
                  </View>
                  <Text style={styles.colTier}>{item.pricing_tier}</Text>
                  <Text style={styles.colShare}>
                    {(item.effective_share_pct / 100).toFixed(0)}%
                  </Text>
                  <Text style={styles.colAmount}>{formatCents(item.period_share_cents)}</Text>
                </View>
              );
            })
          )}
        </View>

        {/* Totals */}
        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{formatCents(props.totalCents)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Tax</Text>
            <Text style={styles.totalValue}>$0.00</Text>
          </View>
          <View style={[styles.totalRow, styles.totalGrand]}>
            <Text style={styles.totalLabel}>Total due</Text>
            <Text style={styles.totalValue}>{formatCents(props.totalCents)}</Text>
          </View>
        </View>

        {/* Payment instructions */}
        <View style={styles.paymentSection}>
          <Text style={styles.paymentHeader}>Payment instructions</Text>
          <Text style={styles.paymentBody}>{props.paymentInstructions}</Text>
        </View>

        {props.notes ? <Text style={styles.notes}>{props.notes}</Text> : null}

        <Text style={styles.footer}>
          Thank you for your business. Questions? Reach us at {props.arborEmail}.
        </Text>
      </Page>
    </Document>
  );
}
