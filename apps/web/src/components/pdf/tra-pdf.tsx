// Server-side @react-pdf/renderer document for TRAs (work intake).
// Imported by /api/tras/[id]/pdf — never bundled to the client.
//
// Renders the FULL assessment: every wizard section (basics, the need,
// audience, business case, learning design, logistics, sustainment,
// approvals) plus all child records (stakeholders, audience roles, KPIs,
// success criteria, objectives, SMEs, evaluation plan, deliverables,
// approvals). Empty fields/sections are omitted to keep it clean. Content
// flows across as many pages as needed; every page carries a numbered footer.

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type {
  DeliverableType,
  Tra,
  TraApproval,
  TraAudienceRole,
  TraDeliverable,
  TraEvaluationPlan,
  TraKpi,
  TraObjective,
  TraSme,
  TraStakeholder,
  TraSuccessCriteria,
} from "@arbor/shared";

// ── Palette (forest-tinted editorial) ───────────────────────────────────────
const C = {
  ink: "#14201a",
  body: "#2b3a34",
  muted: "#6b7d74",
  faint: "#9aa8a0",
  hair: "#dfe6e1",
  hairSoft: "#eef2ef",
  accent: "#2f5d3a",
  accentBg: "#eef4ef",
  surface: "#f7faf8",
  white: "#ffffff",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 48,
    paddingHorizontal: 44,
    fontSize: 9.5,
    fontFamily: "Helvetica",
    color: C.body,
    lineHeight: 1.4,
  },
  accentBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: C.accent,
  },

  // Header
  header: { marginBottom: 18 },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  org: {
    fontSize: 8,
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 1.4,
    fontFamily: "Helvetica-Bold",
  },
  title: {
    fontSize: 23,
    fontFamily: "Helvetica-Bold",
    color: C.ink,
    marginTop: 6,
    lineHeight: 1.15,
  },
  subtitle: { fontSize: 8.5, color: C.muted, marginTop: 6, letterSpacing: 0.3 },
  pillStack: { alignItems: "flex-end", gap: 4 },
  pill: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    textTransform: "capitalize",
  },
  pillStatus: { color: C.white, backgroundColor: C.accent },
  pillPriority: {
    color: C.accent,
    backgroundColor: C.accentBg,
    borderWidth: 1,
    borderColor: C.hair,
  },

  // Summary strip
  summary: {
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
  },
  summaryCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.hair,
    borderRadius: 6,
    padding: 9,
    backgroundColor: C.surface,
  },
  summaryLabel: {
    fontSize: 7,
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  summaryValue: { fontSize: 12, fontFamily: "Helvetica-Bold", color: C.ink },
  summaryValueBig: { fontSize: 17, fontFamily: "Helvetica-Bold", color: C.accent },

  // Sections
  section: { marginTop: 18 },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderBottomWidth: 1.5,
    borderBottomColor: C.ink,
    paddingBottom: 5,
    marginBottom: 9,
  },
  sectionNum: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.accent,
    letterSpacing: 0.5,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: C.ink,
    letterSpacing: 0.2,
  },

  // Field grid
  grid: { flexDirection: "row", flexWrap: "wrap" },
  gridCell: { width: "50%", paddingRight: 12, marginBottom: 9 },
  gridCellFull: { width: "100%", marginBottom: 9 },
  fieldLabel: {
    fontSize: 7.5,
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
    fontFamily: "Helvetica-Bold",
  },
  fieldValue: { fontSize: 9.5, color: C.ink },

  // Prose
  proseBlock: { marginBottom: 9 },
  prose: { fontSize: 9.5, color: C.body, lineHeight: 1.5 },

  // Pills row (modalities, assessment approaches)
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 1 },
  chip: {
    fontSize: 8.5,
    color: C.accent,
    backgroundColor: C.accentBg,
    borderRadius: 9,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
  },

  // Tables
  table: { borderWidth: 1, borderColor: C.hair, borderRadius: 5, marginTop: 2 },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.hairSoft },
  trLast: { flexDirection: "row" },
  thead: { backgroundColor: C.surface },
  zebra: { backgroundColor: "#fcfdfc" },
  th: {
    paddingVertical: 5,
    paddingHorizontal: 7,
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  td: { paddingVertical: 5, paddingHorizontal: 7, fontSize: 9, color: C.ink },
  num: { textAlign: "right" },

  // Objectives list
  objRow: { flexDirection: "row", marginBottom: 5 },
  objNum: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.accent,
    width: 18,
  },
  objText: { fontSize: 9.5, color: C.body, flex: 1, lineHeight: 1.45 },

  // Totals
  totalsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "baseline",
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1.5,
    borderTopColor: C.ink,
  },
  totalsLabel: {
    fontSize: 8,
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginRight: 12,
  },
  totalsValue: { fontSize: 18, fontFamily: "Helvetica-Bold", color: C.accent },

  footer: {
    position: "absolute",
    bottom: 22,
    left: 44,
    right: 44,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: C.hair,
    paddingTop: 6,
    fontSize: 7.5,
    color: C.faint,
  },
});

// ── helpers ──────────────────────────────────────────────────────────────────

function humanize(v: string | null | undefined): string {
  if (!v) return "";
  return v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const has = (v: unknown): boolean =>
  v !== null && v !== undefined && !(typeof v === "string" && v.trim() === "");
const hasRows = (rows: unknown[]): boolean => rows.length > 0;

function fmtDate(d: string | null): string {
  if (!d) return "";
  const parsed = new Date(d.length <= 10 ? d + "T00:00:00Z" : d);
  if (Number.isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

type FieldDef = { label: string; value: string; full?: boolean };

function SectionHead({ num, title }: { num: string; title: string }) {
  return (
    <View style={styles.sectionHead} minPresenceAhead={36}>
      <Text style={styles.sectionNum}>{num}</Text>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function FieldGrid({ fields }: { fields: FieldDef[] }) {
  const shown = fields.filter((f) => has(f.value));
  if (shown.length === 0) return null;
  return (
    <View style={styles.grid}>
      {shown.map((f) => (
        <View key={f.label} style={f.full ? styles.gridCellFull : styles.gridCell}>
          <Text style={styles.fieldLabel}>{f.label}</Text>
          <Text style={styles.fieldValue}>{f.value}</Text>
        </View>
      ))}
    </View>
  );
}

function Prose({ label, value }: { label: string; value: string | null }) {
  if (!has(value)) return null;
  return (
    <View style={styles.proseBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.prose}>{value}</Text>
    </View>
  );
}

function Chips({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <View style={styles.proseBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.chipRow}>
        {items.map((it, i) => (
          <Text key={`${it}-${String(i)}`} style={styles.chip}>
            {humanize(it)}
          </Text>
        ))}
      </View>
    </View>
  );
}

type Col = { header: string; width: string; num?: boolean };

function Table({ cols, rows }: { cols: Col[]; rows: (string | number)[][] }) {
  return (
    <View style={styles.table}>
      <View style={[styles.tr, styles.thead]}>
        {cols.map((c, i) => (
          <Text key={i} style={[styles.th, { width: c.width }, ...(c.num ? [styles.num] : [])]}>
            {c.header}
          </Text>
        ))}
      </View>
      {rows.map((r, ri) => {
        const last = ri === rows.length - 1;
        return (
          <View
            key={ri}
            style={[last ? styles.trLast : styles.tr, ...(ri % 2 === 1 ? [styles.zebra] : [])]}
            wrap={false}
          >
            {r.map((cell, ci) => (
              <Text
                key={ci}
                style={[
                  styles.td,
                  { width: cols[ci]?.width ?? "auto" },
                  ...(cols[ci]?.num ? [styles.num] : []),
                ]}
              >
                {cell === "" ? "—" : String(cell)}
              </Text>
            ))}
          </View>
        );
      })}
    </View>
  );
}

// ── document ──────────────────────────────────────────────────────────────────

type Props = {
  orgName: string;
  tra: Tra;
  deliverables: TraDeliverable[];
  deliverableTypes: DeliverableType[];
  stakeholders: TraStakeholder[];
  audienceRoles: TraAudienceRole[];
  kpis: TraKpi[];
  successCriteria: TraSuccessCriteria[];
  objectives: TraObjective[];
  smes: TraSme[];
  evaluationPlan: TraEvaluationPlan[];
  approvals: TraApproval[];
};

export default function TraPdf({
  orgName,
  tra,
  deliverables,
  deliverableTypes,
  stakeholders,
  audienceRoles,
  kpis,
  successCriteria,
  objectives,
  smes,
  evaluationPlan,
  approvals,
}: Props) {
  const typeName = new Map(deliverableTypes.map((t) => [t.id, t.name]));
  const total = deliverables.reduce((acc, d) => acc + (d.estimated_hours || 0), 0);
  const generatedAt = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const nonEmptyStakeholders = stakeholders.filter(
    (s) => has(s.name) || has(s.role) || has(s.email) || has(s.decision_rights),
  );
  const nonEmptyAudience = audienceRoles.filter((a) => has(a.role) || a.headcount != null);
  const nonEmptyKpis = kpis.filter((k) => has(k.metric) || has(k.baseline) || has(k.target));
  const nonEmptyCriteria = successCriteria.filter(
    (s) => has(s.criteria) || has(s.checkpoint) || has(s.measurement_owner),
  );
  const nonEmptyObjectives = objectives.filter((o) => has(o.text));
  const nonEmptySmes = smes.filter(
    (s) => has(s.name) || has(s.email) || s.availability_hours != null,
  );
  const nonEmptyEval = evaluationPlan.filter(
    (e) => has(e.kirkpatrick_level) || has(e.measurement_method),
  );
  const nonEmptyApprovals = approvals.filter(
    (a) => has(a.name) || has(a.approval_type) || has(a.signed_at),
  );

  const audienceHeadcount = nonEmptyAudience.reduce((acc, a) => acc + (a.headcount ?? 0), 0);

  // Section presence flags so we omit fully-empty sections.
  const needFilled =
    has(tra.business_problem) ||
    has(tra.current_behavior) ||
    has(tra.desired_behavior) ||
    has(tra.root_cause_answer) ||
    has(tra.root_cause_justification) ||
    has(tra.prior_attempts) ||
    has(tra.cost_of_inaction);
  const audienceFilled =
    hasRows(nonEmptyAudience) ||
    tra.audience_locations.length > 0 ||
    tra.audience_languages.length > 0 ||
    has(tra.prerequisite_knowledge) ||
    has(tra.tech_access) ||
    has(tra.accessibility_needs);
  const businessCaseFilled =
    has(tra.priority) ||
    has(tra.budget_range) ||
    has(tra.funding_source) ||
    hasRows(nonEmptyKpis) ||
    hasRows(nonEmptyCriteria);
  const learningFilled =
    hasRows(nonEmptyObjectives) ||
    hasRows(nonEmptySmes) ||
    has(tra.existing_content) ||
    tra.recommended_modalities.length > 0 ||
    tra.estimated_seat_time_hours != null ||
    has(tra.delivery_cadence) ||
    tra.assessment_approaches.length > 0 ||
    hasRows(nonEmptyEval) ||
    hasRows(deliverables);
  const logisticsFilled =
    has(tra.technology_requirements) ||
    has(tra.wcag_target) ||
    has(tra.localization_needs) ||
    has(tra.constraints_notes) ||
    has(tra.pilot_group) ||
    has(tra.feedback_mechanism);
  const sustainmentFilled =
    has(tra.content_owner) || has(tra.reinforcement_plan) || has(tra.review_cadence);

  return (
    <Document
      title={`TRA — ${tra.project_name}`}
      author={orgName}
      subject="Training Request Assessment"
    >
      <Page size="LETTER" style={styles.page} wrap>
        <View style={styles.accentBar} fixed />

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1, paddingRight: 16 }}>
              <Text style={styles.org}>{orgName}</Text>
              <Text style={styles.title}>{tra.project_name}</Text>
              <Text style={styles.subtitle}>
                Training Request Assessment · Generated {generatedAt}
              </Text>
            </View>
            <View style={styles.pillStack}>
              <Text style={[styles.pill, styles.pillStatus]}>{humanize(tra.status)}</Text>
              {has(tra.priority) && (
                <Text style={[styles.pill, styles.pillPriority]}>
                  {humanize(tra.priority)} priority
                </Text>
              )}
            </View>
          </View>

          {/* Summary strip */}
          <View style={styles.summary}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Estimated effort</Text>
              <Text style={styles.summaryValueBig}>{total.toFixed(0)} h</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Deliverables</Text>
              <Text style={styles.summaryValue}>{deliverables.length}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Audience</Text>
              <Text style={styles.summaryValue}>
                {audienceHeadcount > 0 ? `${String(audienceHeadcount)} learners` : "—"}
              </Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Needed by</Text>
              <Text style={styles.summaryValue}>{fmtDate(tra.needed_by_date) || "—"}</Text>
            </View>
          </View>
        </View>

        {/* 01 — Request basics */}
        <View style={styles.section}>
          <SectionHead num="01" title="Request basics" />
          <FieldGrid
            fields={[
              { label: "Requesting department", value: tra.requesting_department ?? "" },
              { label: "Requestor", value: tra.requestor_name ?? "" },
              { label: "Requestor role", value: tra.requestor_role ?? "" },
              { label: "Requestor department", value: tra.requestor_department ?? "" },
              { label: "Executive sponsor", value: tra.executive_sponsor ?? "" },
              { label: "Needed-by date", value: fmtDate(tra.needed_by_date) },
              { label: "Needed-by driver", value: humanize(tra.needed_by_driver) },
              { label: "Submitted", value: fmtDate(tra.submitted_at) },
            ]}
          />
          {hasRows(nonEmptyStakeholders) && (
            <View style={{ marginTop: 4 }}>
              <Text style={styles.fieldLabel}>Key stakeholders</Text>
              <Table
                cols={[
                  { header: "Name", width: "26%" },
                  { header: "Role", width: "24%" },
                  { header: "Decision rights", width: "28%" },
                  { header: "Email", width: "22%" },
                ]}
                rows={nonEmptyStakeholders.map((s) => [
                  s.name ?? "",
                  s.role ?? "",
                  s.decision_rights ?? "",
                  s.email ?? "",
                ])}
              />
            </View>
          )}
        </View>

        {/* 02 — The need */}
        {needFilled && (
          <View style={styles.section}>
            <SectionHead num="02" title="The need" />
            <Prose label="Business problem" value={tra.business_problem} />
            <Prose label="Current behavior" value={tra.current_behavior} />
            <Prose label="Desired behavior" value={tra.desired_behavior} />
            {has(tra.root_cause_answer) && (
              <FieldGrid
                fields={[
                  { label: "Is training the right fix?", value: humanize(tra.root_cause_answer) },
                ]}
              />
            )}
            <Prose label="Justification" value={tra.root_cause_justification} />
            <Prose label="Prior attempts" value={tra.prior_attempts} />
            <Prose label="Cost of inaction" value={tra.cost_of_inaction} />
          </View>
        )}

        {/* 03 — Audience */}
        {audienceFilled && (
          <View style={styles.section}>
            <SectionHead num="03" title="Audience" />
            {hasRows(nonEmptyAudience) && (
              <View style={{ marginBottom: 9 }}>
                <Text style={styles.fieldLabel}>Roles &amp; headcount</Text>
                <Table
                  cols={[
                    { header: "Role", width: "75%" },
                    { header: "Headcount", width: "25%", num: true },
                  ]}
                  rows={nonEmptyAudience.map((a) => [a.role ?? "", a.headcount ?? ""])}
                />
              </View>
            )}
            <Chips label="Locations / time zones" items={tra.audience_locations} />
            <Chips label="Languages" items={tra.audience_languages} />
            <Prose label="Prerequisite knowledge" value={tra.prerequisite_knowledge} />
            <Prose label="Tech access" value={tra.tech_access} />
            <Prose label="Known accessibility needs" value={tra.accessibility_needs} />
          </View>
        )}

        {/* 04 — Business case */}
        {businessCaseFilled && (
          <View style={styles.section}>
            <SectionHead num="04" title="Business case" />
            <FieldGrid
              fields={[
                { label: "Priority", value: humanize(tra.priority) },
                { label: "Budget range", value: tra.budget_range ?? "" },
                { label: "Funding source", value: tra.funding_source ?? "" },
              ]}
            />
            {hasRows(nonEmptyKpis) && (
              <View style={{ marginBottom: 9 }}>
                <Text style={styles.fieldLabel}>KPIs / metrics that will move</Text>
                <Table
                  cols={[
                    { header: "Metric", width: "44%" },
                    { header: "Baseline", width: "28%" },
                    { header: "Target", width: "28%" },
                  ]}
                  rows={nonEmptyKpis.map((k) => [k.metric ?? "", k.baseline ?? "", k.target ?? ""])}
                />
              </View>
            )}
            {hasRows(nonEmptyCriteria) && (
              <View>
                <Text style={styles.fieldLabel}>Success criteria</Text>
                <Table
                  cols={[
                    { header: "Checkpoint", width: "22%" },
                    { header: "What good looks like", width: "52%" },
                    { header: "Owner", width: "26%" },
                  ]}
                  rows={nonEmptyCriteria.map((s) => [
                    humanize(s.checkpoint),
                    s.criteria ?? "",
                    s.measurement_owner ?? "",
                  ])}
                />
              </View>
            )}
          </View>
        )}

        {/* 05 — Learning design */}
        {learningFilled && (
          <View style={styles.section}>
            <SectionHead num="05" title="Learning design" />
            {hasRows(nonEmptyObjectives) && (
              <View style={{ marginBottom: 10 }}>
                <Text style={styles.fieldLabel}>Learning objectives</Text>
                {nonEmptyObjectives.map((o, i) => (
                  <View key={o.id} style={styles.objRow} wrap={false}>
                    <Text style={styles.objNum}>{i + 1}.</Text>
                    <Text style={styles.objText}>{o.text}</Text>
                  </View>
                ))}
              </View>
            )}
            <FieldGrid
              fields={[
                {
                  label: "Estimated seat time",
                  value:
                    tra.estimated_seat_time_hours != null
                      ? `${String(tra.estimated_seat_time_hours)} h`
                      : "",
                },
                { label: "Delivery cadence", value: humanize(tra.delivery_cadence) },
              ]}
            />
            <Chips label="Recommended modalities" items={tra.recommended_modalities} />
            <Chips label="Assessment approach" items={tra.assessment_approaches} />
            <Prose label="Existing content to build from" value={tra.existing_content} />
            {hasRows(nonEmptySmes) && (
              <View style={{ marginBottom: 9 }}>
                <Text style={styles.fieldLabel}>Subject matter experts</Text>
                <Table
                  cols={[
                    { header: "Name", width: "40%" },
                    { header: "Email", width: "38%" },
                    { header: "Hrs / wk", width: "22%", num: true },
                  ]}
                  rows={nonEmptySmes.map((s) => [
                    s.name ?? "",
                    s.email ?? "",
                    s.availability_hours ?? "",
                  ])}
                />
              </View>
            )}
            {hasRows(nonEmptyEval) && (
              <View style={{ marginBottom: 9 }}>
                <Text style={styles.fieldLabel}>Evaluation plan</Text>
                <Table
                  cols={[
                    { header: "Kirkpatrick level", width: "38%" },
                    { header: "Measurement method", width: "62%" },
                  ]}
                  rows={nonEmptyEval.map((e) => [
                    `Level ${String(e.kirkpatrick_level)}`,
                    e.measurement_method ?? "",
                  ])}
                />
              </View>
            )}

            {/* Deliverables + effort total */}
            <Text style={[styles.fieldLabel, { marginTop: 2 }]}>Deliverables breakdown</Text>
            {deliverables.length === 0 ? (
              <Text style={styles.prose}>No deliverables recorded.</Text>
            ) : (
              <Table
                cols={[
                  { header: "Deliverable", width: "34%" },
                  { header: "Type", width: "24%" },
                  { header: "Seat hrs", width: "12%", num: true },
                  { header: "Qty", width: "8%", num: true },
                  { header: "×", width: "8%", num: true },
                  { header: "Hours", width: "14%", num: true },
                ]}
                rows={deliverables.map((d) => [
                  d.name,
                  typeName.get(d.deliverable_type_id) ?? "—",
                  d.seat_time_hours.toFixed(1),
                  d.quantity,
                  d.complexity_multiplier.toFixed(2),
                  d.estimated_hours.toFixed(1),
                ])}
              />
            )}
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Total estimated trainer hours</Text>
              <Text style={styles.totalsValue}>{total.toFixed(0)} h</Text>
            </View>
          </View>
        )}

        {/* 06 — Logistics & constraints */}
        {logisticsFilled && (
          <View style={styles.section}>
            <SectionHead num="06" title="Logistics & constraints" />
            <FieldGrid
              fields={[
                { label: "Accessibility conformance target", value: humanize(tra.wcag_target) },
              ]}
            />
            <Prose label="Technology requirements" value={tra.technology_requirements} />
            <Prose label="Localization needs" value={tra.localization_needs} />
            <Prose label="Constraints" value={tra.constraints_notes} />
            <Prose label="Pilot group" value={tra.pilot_group} />
            <Prose label="Feedback mechanism" value={tra.feedback_mechanism} />
          </View>
        )}

        {/* 07 — Sustainment */}
        {sustainmentFilled && (
          <View style={styles.section}>
            <SectionHead num="07" title="Sustainment" />
            <Prose label="Content owner post-launch" value={tra.content_owner} />
            <Prose label="Reinforcement plan" value={tra.reinforcement_plan} />
            <Prose label="Review cadence" value={tra.review_cadence} />
          </View>
        )}

        {/* 08 — Approvals */}
        {hasRows(nonEmptyApprovals) && (
          <View style={styles.section}>
            <SectionHead num="08" title="Approvals" />
            <Table
              cols={[
                { header: "Approval", width: "40%" },
                { header: "Name", width: "36%" },
                { header: "Signed", width: "24%" },
              ]}
              rows={nonEmptyApprovals.map((a) => [
                humanize(a.approval_type),
                a.name ?? "",
                fmtDate(a.signed_at) || "Pending",
              ])}
            />
          </View>
        )}

        {/* Adjustments */}
        {has(tra.adjustments_notes) && (
          <View style={styles.section}>
            <SectionHead num="—" title="Adjustments & assumptions" />
            <Text style={styles.prose}>{tra.adjustments_notes}</Text>
          </View>
        )}

        {/* Footer on every page */}
        <View style={styles.footer} fixed>
          <Text>Arbor · Training capacity management — {orgName}</Text>
          <Text
            render={({ pageNumber, totalPages }) => `${String(pageNumber)} / ${String(totalPages)}`}
          />
        </View>
      </Page>
    </Document>
  );
}
