// Server-side @react-pdf/renderer document for TRAs.
// Imported by /api/tras/[id]/pdf — never bundled to the client.

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { DeliverableType, Tra, TraDeliverable } from "@arbor/shared";

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#0f172a",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingBottom: 12,
    marginBottom: 16,
  },
  org: {
    fontSize: 9,
    color: "#64748b",
  },
  title: {
    fontSize: 16,
    fontWeight: 700,
    marginTop: 2,
  },
  badge: {
    fontSize: 9,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    color: "#1e293b",
    backgroundColor: "#e2e8f0",
    textTransform: "capitalize",
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 6,
    color: "#0f172a",
  },
  section: {
    marginBottom: 14,
  },
  fieldGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  field: {
    flexBasis: "48%",
    marginBottom: 4,
  },
  label: {
    fontSize: 8,
    color: "#64748b",
    marginBottom: 2,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  value: {
    fontSize: 10,
    color: "#0f172a",
  },
  table: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 4,
    overflow: "hidden",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  tableRowLast: {
    flexDirection: "row",
  },
  tableHead: {
    backgroundColor: "#f1f5f9",
    fontWeight: 700,
    fontSize: 9,
  },
  cell: {
    padding: 6,
    fontSize: 9,
  },
  cellName: { width: "32%" },
  cellType: { width: "26%" },
  cellSeat: { width: "10%", textAlign: "right" as const },
  cellQty: { width: "8%", textAlign: "right" as const },
  cellMult: { width: "10%", textAlign: "right" as const },
  cellHours: { width: "14%", textAlign: "right" as const, fontWeight: 700 },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  totalsLabel: {
    fontSize: 10,
    color: "#64748b",
    marginRight: 12,
  },
  totalsValue: {
    fontSize: 14,
    fontWeight: 700,
    color: "#0f172a",
  },
  prose: {
    fontSize: 10,
    lineHeight: 1.5,
    color: "#0f172a",
  },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 36,
    right: 36,
    textAlign: "center",
    fontSize: 8,
    color: "#94a3b8",
  },
});

type Props = {
  orgName: string;
  tra: Tra;
  deliverables: TraDeliverable[];
  deliverableTypes: DeliverableType[];
};

export default function TraPdf({ orgName, tra, deliverables, deliverableTypes }: Props) {
  const typeName = new Map(deliverableTypes.map((t) => [t.id, t.name]));
  const total = deliverables.reduce((acc, d) => acc + (d.estimated_hours || 0), 0);
  const generatedAt = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const fields: { label: string; value: string }[] = [
    ["Requesting department", tra.requesting_department ?? "—"],
    ["Stakeholder", tra.stakeholder_name ?? "—"],
    ["Stakeholder email", tra.stakeholder_email ?? "—"],
    ["Target audience", tra.target_audience ?? "—"],
    ["Urgency", tra.urgency],
    ["Status", tra.status],
  ].map(([label, value]) => ({ label: label as string, value: value as string }));

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.org}>{orgName}</Text>
            <Text style={styles.title}>{tra.project_name}</Text>
            <Text style={[styles.org, { marginTop: 4 }]}>
              Training Request Assessment · Generated {generatedAt}
            </Text>
          </View>
          <Text style={styles.badge}>{tra.status}</Text>
        </View>

        {/* Project info */}
        <View style={styles.section}>
          <Text style={styles.sectionHeading}>Project information</Text>
          <View style={styles.fieldGrid}>
            {fields.map((f) => (
              <View key={f.label} style={styles.field}>
                <Text style={styles.label}>{f.label}</Text>
                <Text style={styles.value}>{f.value}</Text>
              </View>
            ))}
          </View>
        </View>

        {tra.description && (
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>Description</Text>
            <Text style={styles.prose}>{tra.description}</Text>
          </View>
        )}

        {tra.business_justification && (
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>Business justification</Text>
            <Text style={styles.prose}>{tra.business_justification}</Text>
          </View>
        )}

        {/* Deliverables */}
        <View style={styles.section}>
          <Text style={styles.sectionHeading}>Deliverables</Text>
          {deliverables.length === 0 ? (
            <Text style={styles.prose}>No deliverables.</Text>
          ) : (
            <View style={styles.table}>
              <View style={[styles.tableRow, styles.tableHead]}>
                <Text style={[styles.cell, styles.cellName]}>Deliverable</Text>
                <Text style={[styles.cell, styles.cellType]}>Type</Text>
                <Text style={[styles.cell, styles.cellSeat]}>Seat hrs</Text>
                <Text style={[styles.cell, styles.cellQty]}>Qty</Text>
                <Text style={[styles.cell, styles.cellMult]}>×</Text>
                <Text style={[styles.cell, styles.cellHours]}>Hours</Text>
              </View>
              {deliverables.map((d, i) => {
                const isLast = i === deliverables.length - 1;
                return (
                  <View key={d.id} style={isLast ? styles.tableRowLast : styles.tableRow}>
                    <Text style={[styles.cell, styles.cellName]}>{d.name}</Text>
                    <Text style={[styles.cell, styles.cellType]}>
                      {typeName.get(d.deliverable_type_id) ?? "—"}
                    </Text>
                    <Text style={[styles.cell, styles.cellSeat]}>
                      {d.seat_time_hours.toFixed(1)}
                    </Text>
                    <Text style={[styles.cell, styles.cellQty]}>{d.quantity}</Text>
                    <Text style={[styles.cell, styles.cellMult]}>
                      {d.complexity_multiplier.toFixed(2)}
                    </Text>
                    <Text style={[styles.cell, styles.cellHours]}>
                      {d.estimated_hours.toFixed(1)}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Total estimated hours</Text>
            <Text style={styles.totalsValue}>{total.toFixed(1)}</Text>
          </View>
        </View>

        {tra.adjustments_notes && (
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>Adjustments &amp; assumptions</Text>
            <Text style={styles.prose}>{tra.adjustments_notes}</Text>
          </View>
        )}

        <Text style={styles.footer}>Arbor — Training capacity management · {orgName}</Text>
      </Page>
    </Document>
  );
}
