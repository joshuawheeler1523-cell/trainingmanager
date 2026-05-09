/**
 * Display label types for the workspace identity layer.
 *
 * The internal identifiers (role values like "manager", entity table names like
 * "instructors") never change. The strings rendered in the UI are looked up via
 * a label kind key — defaults live in `defaults.ts`, per-org overrides live in
 * `organizations.role_labels` + `organizations.entity_labels`.
 *
 * Audit log entries always use the canonical internal identifiers, never the
 * display labels — so language drift across orgs doesn't poison the audit trail.
 */

/** Plural variants live alongside singular for grammatically correct rendering. */
export interface LabelValue {
  singular: string;
  plural: string;
}

/** All known label kinds. Extending this requires updating DEFAULT_LABELS too. */
export type LabelKind = "role.manager" | "role.instructor" | "role.viewer" | "entity.instructor";

/** Map of label kind → resolved label. Returned by useOrgLabels(). */
export type LabelMap = Record<LabelKind, LabelValue>;

/** Per-org override shape stored in organizations.role_labels / entity_labels. */
export type LabelOverrides = Partial<Record<LabelKind, Partial<LabelValue>>>;
