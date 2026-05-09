import { z } from "zod";

const emptyToNull = z
  .string()
  .nullish()
  .transform((v) => (v === "" || v == null ? null : v));

const csvOptionalEmail = z
  .string()
  .nullish()
  .transform((v) => (v === "" || v == null ? null : v))
  .pipe(z.string().email("Must be a valid email address").nullable());

// ── Enumerations ────────────────────────────────────────────────────────────

export const TRA_STATUS_VALUES = [
  "draft",
  "documented",
  "converted",
  "completed",
  "cancelled",
] as const;
export type TraStatus = (typeof TRA_STATUS_VALUES)[number];

export const TRA_PRIORITY_VALUES = ["nice_to_have", "important", "regulatory"] as const;
export type TraPriority = (typeof TRA_PRIORITY_VALUES)[number];

export const TRA_NEEDED_BY_DRIVER_VALUES = [
  "launch",
  "audit",
  "fiscal",
  "regulatory",
  "other",
] as const;
export type TraNeededByDriver = (typeof TRA_NEEDED_BY_DRIVER_VALUES)[number];

export const TRA_ROOT_CAUSE_VALUES = ["yes", "maybe", "no"] as const;
export type TraRootCauseAnswer = (typeof TRA_ROOT_CAUSE_VALUES)[number];

export const TRA_MODALITY_VALUES = [
  "ilt",
  "vilt",
  "elearning",
  "blended",
  "microlearning",
  "job_aid",
  "coaching",
] as const;
export type TraModality = (typeof TRA_MODALITY_VALUES)[number];

export const TRA_DELIVERY_CADENCE_VALUES = [
  "one_time",
  "cohort",
  "always_on",
  "recurring",
] as const;
export type TraDeliveryCadence = (typeof TRA_DELIVERY_CADENCE_VALUES)[number];

export const TRA_WCAG_TARGET_VALUES = ["a", "aa", "aaa", "section_508", "none"] as const;
export type TraWcagTarget = (typeof TRA_WCAG_TARGET_VALUES)[number];

export const TRA_APPROVAL_TYPE_VALUES = ["sponsor", "budget", "id_lead", "scope_change"] as const;
export type TraApprovalType = (typeof TRA_APPROVAL_TYPE_VALUES)[number];

export const TRA_SUCCESS_CHECKPOINT_VALUES = ["30", "90", "180"] as const;
export type TraSuccessCheckpoint = (typeof TRA_SUCCESS_CHECKPOINT_VALUES)[number];

export const PROJECT_PRIORITY_VALUES = ["low", "medium", "high", "critical"] as const;
export type ProjectPriority = (typeof PROJECT_PRIORITY_VALUES)[number];

// TRA priority → project priority (used by convertTraToProject).
// nice_to_have → low; important → medium; regulatory → high.
export function traPriorityToProjectPriority(p: TraPriority | null): ProjectPriority {
  switch (p) {
    case "nice_to_have":
      return "low";
    case "regulatory":
      return "high";
    default:
      return "medium";
  }
}

// ── tras (top-level fields) ─────────────────────────────────────────────────
//
// All fields are optional at the schema level — drafts can be saved with
// almost nothing filled in. Required-at-submit fields are validated by the
// application layer when status flips to 'submitted'. See REQUIRED_AT_SUBMIT
// below for the canonical list.

const optionalString = emptyToNull;
const stringArray = z.array(z.string().min(1)).default([]);

export const traInsertSchema = z
  .object({
    project_name: z.string().min(1, "Project name is required").max(200),
    requesting_department: optionalString,

    // Section 1 — Request basics
    requestor_name: optionalString,
    requestor_role: optionalString,
    requestor_department: optionalString,
    executive_sponsor: optionalString,
    needed_by_date: optionalString, // ISO date string
    needed_by_driver: z.enum(TRA_NEEDED_BY_DRIVER_VALUES).nullable().optional(),

    // Section 2 — The need
    business_problem: optionalString,
    current_behavior: optionalString,
    desired_behavior: optionalString,
    root_cause_answer: z.enum(TRA_ROOT_CAUSE_VALUES).nullable().optional(),
    root_cause_justification: optionalString,
    prior_attempts: optionalString,
    cost_of_inaction: optionalString,

    // Section 3 — Audience
    audience_locations: stringArray,
    audience_languages: stringArray,
    prerequisite_knowledge: optionalString,
    tech_access: optionalString,
    accessibility_needs: optionalString,

    // Section 4 — Business case
    priority: z.enum(TRA_PRIORITY_VALUES).nullable().optional(),
    budget_range: optionalString,
    funding_source: optionalString,

    // Section 5 — Learning design (top-level)
    existing_content: optionalString,
    recommended_modalities: z.array(z.enum(TRA_MODALITY_VALUES)).default([]),
    estimated_seat_time_hours: z.coerce.number().min(0).nullable().optional(),
    delivery_cadence: z.enum(TRA_DELIVERY_CADENCE_VALUES).nullable().optional(),
    assessment_approaches: stringArray,

    // Section 6 — Logistics
    technology_requirements: optionalString,
    wcag_target: z.enum(TRA_WCAG_TARGET_VALUES).nullable().optional(),
    localization_needs: optionalString,
    constraints_notes: optionalString,
    pilot_group: optionalString,
    feedback_mechanism: optionalString,

    // Section 7 — Sustainment
    content_owner: optionalString,
    reinforcement_plan: optionalString,
    review_cadence: optionalString,

    // Existing
    adjustments_notes: optionalString,
    ai_assistant_used: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    if (
      (data.root_cause_answer === "maybe" || data.root_cause_answer === "no") &&
      !data.root_cause_justification
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Justification is required when training isn't the right fix or needs diagnosis.",
        path: ["root_cause_justification"],
      });
    }
  });

export const traUpdateSchema = z
  .object({
    project_name: z.string().min(1).max(200).optional(),
    requesting_department: optionalString.optional(),

    requestor_name: optionalString.optional(),
    requestor_role: optionalString.optional(),
    requestor_department: optionalString.optional(),
    executive_sponsor: optionalString.optional(),
    needed_by_date: optionalString.optional(),
    needed_by_driver: z.enum(TRA_NEEDED_BY_DRIVER_VALUES).nullable().optional(),

    business_problem: optionalString.optional(),
    current_behavior: optionalString.optional(),
    desired_behavior: optionalString.optional(),
    root_cause_answer: z.enum(TRA_ROOT_CAUSE_VALUES).nullable().optional(),
    root_cause_justification: optionalString.optional(),
    prior_attempts: optionalString.optional(),
    cost_of_inaction: optionalString.optional(),

    audience_locations: z.array(z.string().min(1)).optional(),
    audience_languages: z.array(z.string().min(1)).optional(),
    prerequisite_knowledge: optionalString.optional(),
    tech_access: optionalString.optional(),
    accessibility_needs: optionalString.optional(),

    priority: z.enum(TRA_PRIORITY_VALUES).nullable().optional(),
    budget_range: optionalString.optional(),
    funding_source: optionalString.optional(),

    existing_content: optionalString.optional(),
    recommended_modalities: z.array(z.enum(TRA_MODALITY_VALUES)).optional(),
    estimated_seat_time_hours: z.coerce.number().min(0).nullable().optional(),
    delivery_cadence: z.enum(TRA_DELIVERY_CADENCE_VALUES).nullable().optional(),
    assessment_approaches: z.array(z.string().min(1)).optional(),

    technology_requirements: optionalString.optional(),
    wcag_target: z.enum(TRA_WCAG_TARGET_VALUES).nullable().optional(),
    localization_needs: optionalString.optional(),
    constraints_notes: optionalString.optional(),
    pilot_group: optionalString.optional(),
    feedback_mechanism: optionalString.optional(),

    content_owner: optionalString.optional(),
    reinforcement_plan: optionalString.optional(),
    review_cadence: optionalString.optional(),

    adjustments_notes: optionalString.optional(),
    ai_assistant_used: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (
      (data.root_cause_answer === "maybe" || data.root_cause_answer === "no") &&
      data.root_cause_justification === null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Justification is required when training isn't the right fix or needs diagnosis.",
        path: ["root_cause_justification"],
      });
    }
  });

export type TraInput = z.infer<typeof traInsertSchema>;
export type TraUpdate = z.infer<typeof traUpdateSchema>;

export type Tra = {
  id: string;
  org_id: string;
  department_id: string;
  project_name: string;
  requesting_department: string | null;

  requestor_name: string | null;
  requestor_role: string | null;
  requestor_department: string | null;
  submitted_at: string | null;
  executive_sponsor: string | null;
  needed_by_date: string | null;
  needed_by_driver: TraNeededByDriver | null;

  business_problem: string | null;
  current_behavior: string | null;
  desired_behavior: string | null;
  root_cause_answer: TraRootCauseAnswer | null;
  root_cause_justification: string | null;
  prior_attempts: string | null;
  cost_of_inaction: string | null;

  audience_locations: string[];
  audience_languages: string[];
  prerequisite_knowledge: string | null;
  tech_access: string | null;
  accessibility_needs: string | null;

  priority: TraPriority | null;
  budget_range: string | null;
  funding_source: string | null;

  existing_content: string | null;
  recommended_modalities: TraModality[];
  estimated_seat_time_hours: number | null;
  delivery_cadence: TraDeliveryCadence | null;
  assessment_approaches: string[];

  technology_requirements: string | null;
  wcag_target: TraWcagTarget | null;
  localization_needs: string | null;
  constraints_notes: string | null;
  pilot_group: string | null;
  feedback_mechanism: string | null;

  content_owner: string | null;
  reinforcement_plan: string | null;
  review_cadence: string | null;

  status: TraStatus;
  total_estimated_hours: number;
  adjustments_notes: string | null;
  converted_to_project_id: string | null;
  ai_assistant_used: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

// ── Required-at-submit ──────────────────────────────────────────────────────
//
// These fields are not enforced by Zod (drafts are flexible) but the
// submitTra action and the UI gap banner check them when the user attempts
// to flip status from draft to submitted.

export type SubmitGap = {
  field: keyof Tra | "objectives";
  label: string;
  section: number;
};

export function listSubmitGaps(
  tra: Pick<Tra, "business_problem" | "cost_of_inaction" | "root_cause_answer" | "priority">,
  hasAtLeastOneObjective: boolean,
): SubmitGap[] {
  const gaps: SubmitGap[] = [];
  if (!tra.business_problem) {
    gaps.push({ field: "business_problem", label: "Business problem", section: 2 });
  }
  if (!tra.root_cause_answer) {
    gaps.push({ field: "root_cause_answer", label: "Root cause check", section: 2 });
  }
  if (!tra.cost_of_inaction) {
    gaps.push({ field: "cost_of_inaction", label: "Cost of inaction", section: 2 });
  }
  if (!tra.priority) {
    gaps.push({ field: "priority", label: "Priority", section: 4 });
  }
  if (!hasAtLeastOneObjective) {
    gaps.push({ field: "objectives", label: "At least one learning objective", section: 5 });
  }
  return gaps;
}

// ── Child rows ──────────────────────────────────────────────────────────────

export const traStakeholderSchema = z.object({
  id: z.string().uuid().optional(),
  position: z.coerce.number().int().min(0).default(0),
  name: optionalString,
  role: optionalString,
  decision_rights: optionalString,
  email: csvOptionalEmail,
});
export type TraStakeholderInput = z.infer<typeof traStakeholderSchema>;
export type TraStakeholder = {
  id: string;
  org_id: string;
  department_id: string;
  tra_id: string;
  position: number;
  name: string | null;
  role: string | null;
  decision_rights: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
};

export const traAudienceRoleSchema = z.object({
  id: z.string().uuid().optional(),
  position: z.coerce.number().int().min(0).default(0),
  role: optionalString,
  headcount: z.coerce.number().int().min(0).nullable().optional(),
});
export type TraAudienceRoleInput = z.infer<typeof traAudienceRoleSchema>;
export type TraAudienceRole = {
  id: string;
  org_id: string;
  department_id: string;
  tra_id: string;
  position: number;
  role: string | null;
  headcount: number | null;
  created_at: string;
  updated_at: string;
};

export const traKpiSchema = z.object({
  id: z.string().uuid().optional(),
  position: z.coerce.number().int().min(0).default(0),
  metric: optionalString,
  baseline: optionalString,
  target: optionalString,
});
export type TraKpiInput = z.infer<typeof traKpiSchema>;
export type TraKpi = {
  id: string;
  org_id: string;
  department_id: string;
  tra_id: string;
  position: number;
  metric: string | null;
  baseline: string | null;
  target: string | null;
  created_at: string;
  updated_at: string;
};

export const traSuccessCriteriaSchema = z.object({
  id: z.string().uuid().optional(),
  checkpoint: z.enum(TRA_SUCCESS_CHECKPOINT_VALUES),
  criteria: optionalString,
  measurement_owner: optionalString,
});
export type TraSuccessCriteriaInput = z.infer<typeof traSuccessCriteriaSchema>;
export type TraSuccessCriteria = {
  id: string;
  org_id: string;
  department_id: string;
  tra_id: string;
  checkpoint: TraSuccessCheckpoint;
  criteria: string | null;
  measurement_owner: string | null;
  created_at: string;
  updated_at: string;
};

export const traObjectiveSchema = z.object({
  id: z.string().uuid().optional(),
  position: z.coerce.number().int().min(0).default(0),
  text: optionalString,
});
export type TraObjectiveInput = z.infer<typeof traObjectiveSchema>;
export type TraObjective = {
  id: string;
  org_id: string;
  department_id: string;
  tra_id: string;
  position: number;
  text: string | null;
  created_at: string;
  updated_at: string;
};

export const traSmeSchema = z.object({
  id: z.string().uuid().optional(),
  position: z.coerce.number().int().min(0).default(0),
  name: optionalString,
  email: csvOptionalEmail,
  availability_hours: z.coerce.number().min(0).nullable().optional(),
});
export type TraSmeInput = z.infer<typeof traSmeSchema>;
export type TraSme = {
  id: string;
  org_id: string;
  department_id: string;
  tra_id: string;
  position: number;
  name: string | null;
  email: string | null;
  availability_hours: number | null;
  created_at: string;
  updated_at: string;
};

export const traEvaluationPlanSchema = z.object({
  id: z.string().uuid().optional(),
  kirkpatrick_level: z.coerce.number().int().min(1).max(4),
  measurement_method: optionalString,
});
export type TraEvaluationPlanInput = z.infer<typeof traEvaluationPlanSchema>;
export type TraEvaluationPlan = {
  id: string;
  org_id: string;
  department_id: string;
  tra_id: string;
  kirkpatrick_level: 1 | 2 | 3 | 4;
  measurement_method: string | null;
  created_at: string;
  updated_at: string;
};

export const traApprovalSchema = z.object({
  id: z.string().uuid().optional(),
  approval_type: z.enum(TRA_APPROVAL_TYPE_VALUES),
  name: optionalString,
  signed_at: optionalString, // ISO datetime string
});
export type TraApprovalInput = z.infer<typeof traApprovalSchema>;
export type TraApproval = {
  id: string;
  org_id: string;
  department_id: string;
  tra_id: string;
  approval_type: TraApprovalType;
  name: string | null;
  signed_at: string | null;
  created_at: string;
  updated_at: string;
};

// ── tra_deliverables (existing) ─────────────────────────────────────────────

export const deliverableInsertSchema = z.object({
  deliverable_type_id: z.string().uuid(),
  name: z.string().min(1, "Deliverable name is required").max(200),
  seat_time_hours: z.coerce.number().min(0),
  quantity: z.coerce.number().int().min(1).default(1),
  complexity_multiplier: z.coerce.number().min(0.5).max(3.0).default(1.0),
  notes: emptyToNull,
});

export const deliverableUpdateSchema = deliverableInsertSchema.partial();

export type DeliverableInput = z.infer<typeof deliverableInsertSchema>;
export type DeliverableUpdate = z.infer<typeof deliverableUpdateSchema>;

export type TraDeliverable = {
  id: string;
  org_id: string;
  tra_id: string;
  deliverable_type_id: string;
  name: string;
  seat_time_hours: number;
  quantity: number;
  complexity_multiplier: number;
  estimated_hours: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

// ── deliverable_types (catalog) ─────────────────────────────────────────────

export type DeliverableType = {
  id: string;
  org_id: string | null;
  name: string;
  dev_to_seat_ratio: number;
  description: string | null;
  is_built_in: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export function computeDeliverableEstimatedHours(args: {
  seat_time_hours: number;
  dev_to_seat_ratio: number;
  quantity: number;
  complexity_multiplier: number;
}): number {
  return args.seat_time_hours * args.dev_to_seat_ratio * args.quantity * args.complexity_multiplier;
}

// ── Bloom's taxonomy — observable verbs for learning objectives ─────────────
//
// Loose adaptation of Anderson & Krathwohl (2001) revision of Bloom (1956).
// Used by the objectives sub-form to warn (not block) when a user writes an
// objective lacking an observable action verb.

export const BLOOM_VERBS = [
  // Remember
  "arrange",
  "cite",
  "define",
  "describe",
  "duplicate",
  "enumerate",
  "identify",
  "label",
  "list",
  "match",
  "memorize",
  "name",
  "order",
  "outline",
  "quote",
  "recall",
  "recite",
  "recognize",
  "record",
  "repeat",
  "reproduce",
  "select",
  "state",
  "tabulate",
  "tell",
  // Understand
  "associate",
  "characterize",
  "classify",
  "clarify",
  "compare",
  "contrast",
  "convert",
  "differentiate",
  "discuss",
  "distinguish",
  "estimate",
  "explain",
  "express",
  "extrapolate",
  "generalize",
  "give",
  "illustrate",
  "indicate",
  "infer",
  "interpret",
  "locate",
  "paraphrase",
  "predict",
  "report",
  "restate",
  "review",
  "rewrite",
  "summarize",
  "translate",
  // Apply
  "apply",
  "calculate",
  "carry out",
  "change",
  "choose",
  "compute",
  "demonstrate",
  "develop",
  "discover",
  "dramatize",
  "employ",
  "execute",
  "experiment",
  "implement",
  "interpret",
  "investigate",
  "manipulate",
  "modify",
  "operate",
  "perform",
  "practice",
  "predict",
  "prepare",
  "produce",
  "schedule",
  "show",
  "sketch",
  "solve",
  "use",
  "utilize",
  // Analyze
  "analyze",
  "appraise",
  "break down",
  "categorize",
  "compare",
  "contrast",
  "deconstruct",
  "diagram",
  "differentiate",
  "discriminate",
  "dissect",
  "examine",
  "experiment",
  "infer",
  "inspect",
  "inventory",
  "outline",
  "question",
  "relate",
  "separate",
  "subdivide",
  "test",
  // Evaluate
  "argue",
  "assess",
  "attach",
  "choose",
  "compare",
  "conclude",
  "contrast",
  "critique",
  "defend",
  "estimate",
  "evaluate",
  "grade",
  "judge",
  "justify",
  "measure",
  "predict",
  "rank",
  "rate",
  "recommend",
  "score",
  "support",
  "validate",
  "verify",
  // Create
  "assemble",
  "build",
  "compile",
  "compose",
  "construct",
  "create",
  "design",
  "devise",
  "formulate",
  "generate",
  "hypothesize",
  "invent",
  "make",
  "originate",
  "plan",
  "produce",
  "propose",
  "rearrange",
  "reorganize",
  "structure",
  "synthesize",
  "write",
] as const;

// Phrases the form should warn against — they describe internal mental states
// that can't be directly observed or measured.
export const WEAK_OBJECTIVE_PHRASES = [
  "understand",
  "know",
  "be aware of",
  "be familiar with",
  "appreciate",
  "comprehend",
  "grasp",
  "learn",
  "be exposed to",
] as const;

const BLOOM_VERB_SET = new Set(BLOOM_VERBS.map((v) => v.toLowerCase()));

export type ObjectiveCheckResult =
  | { ok: true }
  | { ok: false; reason: "weak_phrase"; phrase: string }
  | { ok: false; reason: "no_observable_verb" };

/**
 * Inspect a learning-objective string for issues. Pure helper — UI uses this
 * to render a warning underneath the input. Not used as a hard validator.
 */
export function checkObjective(text: string): ObjectiveCheckResult {
  const trimmed = text.trim().toLowerCase();
  if (trimmed === "") return { ok: true };
  for (const phrase of WEAK_OBJECTIVE_PHRASES) {
    // word-boundary match so "knowledge" doesn't trip "know"
    const re = new RegExp(`\\b${phrase.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i");
    if (re.test(trimmed)) return { ok: false, reason: "weak_phrase", phrase };
  }
  // Look for at least one Bloom verb among the first ~5 words.
  const tokens = trimmed
    .split(/[^a-z]+/)
    .filter(Boolean)
    .slice(0, 6);
  const hasBloom = tokens.some((t) => BLOOM_VERB_SET.has(t));
  if (!hasBloom) return { ok: false, reason: "no_observable_verb" };
  return { ok: true };
}
