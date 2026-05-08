// Shared PDF layout primitives for the report exports. Each report has
// its own Document component (so it can render its own tables and charts);
// this file provides the styles + the page header/footer they all share.

import { StyleSheet, Text, View } from "@react-pdf/renderer";

export const reportStyles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica" },
  title: { fontSize: 16, fontWeight: 700, marginBottom: 4 },
  subtitle: { fontSize: 10, color: "#475569", marginBottom: 12 },
  sectionTitle: { fontSize: 12, fontWeight: 700, marginTop: 12, marginBottom: 6 },
  table: { borderStyle: "solid", borderWidth: 1, borderColor: "#cbd5e1", marginTop: 4 },
  row: {
    flexDirection: "row",
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  rowHeader: { backgroundColor: "#f1f5f9", fontWeight: 700 },
  cell: { padding: 4, borderRightStyle: "solid", borderRightWidth: 1, borderRightColor: "#e2e8f0" },
  cellLast: { padding: 4 },
  meta: { color: "#64748b", fontSize: 9 },
});

export function ReportHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View>
      <Text style={reportStyles.title}>{title}</Text>
      {subtitle ? <Text style={reportStyles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

// Period subtitle: "<orgName> · <start> – <end>" (or "<orgName>" if no dates).
export function periodSubtitle(args: {
  orgName: string;
  start: string | null;
  end: string | null;
}): string {
  if (args.start && args.end) return `${args.orgName} · ${args.start} – ${args.end}`;
  return args.orgName;
}
