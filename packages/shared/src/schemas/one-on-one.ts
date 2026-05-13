import { z } from "zod";

// PHI-safety policy: 1:1s store NO freeform text on the parent row. Topics +
// concerns + sentiment are enums. Action item descriptions are capped at 140
// chars with a "no patient identifiers" placeholder enforced at the form layer.

export const ONE_ON_ONE_TOPIC_CODES = [
  "workload",
  "class_assignments",
  "recurring_tasks",
  "ad_hoc_burden",
  "pto_planning",
  "coverage_gap",
  "skill_development",
  "project_assignment",
  "other_operational",
] as const;

export const ONE_ON_ONE_CONCERN_CODES = [
  "overallocated",
  "underutilized",
  "burnout_risk",
  "needs_pto",
  "skill_gap",
  "schedule_conflict",
  "coverage_gap",
] as const;

export const ONE_ON_ONE_SENTIMENTS = ["on_track", "watch", "action_needed"] as const;
export const ONE_ON_ONE_ITEM_CATEGORIES = [
  "reduce_allocation",
  "add_coverage",
  "reassign_task",
  "pto_scheduling",
  "training_need",
  "project_assignment",
  "other_operational",
] as const;
export const ONE_ON_ONE_ITEM_OWNERS = ["manager", "instructor", "shared"] as const;
export const ONE_ON_ONE_ITEM_STATUSES = ["open", "in_progress", "done", "cancelled"] as const;

export const ONE_ON_ONE_CHANGE_KINDS = ["added", "removed", "modified"] as const;
export const ONE_ON_ONE_CHANGE_SOURCE_KINDS = [
  "class_assignment",
  "recurring_assignment",
  "ad_hoc_task",
  "individual_allocation",
] as const;
export const ONE_ON_ONE_CHANGE_RATIONALES = [
  "overallocated",
  "underutilized",
  "coverage_gap",
  "pto_planning",
  "project_rebalance",
  "task_complete",
  "other_operational",
] as const;

export const oneOnOneCreateSchema = z.object({
  instructor_id: z.string().uuid(),
  scheduled_for: z.string().datetime().optional(),
});

export const oneOnOneUpdateSchema = z.object({
  scheduled_for: z.string().datetime().optional(),
  sentiment: z.enum(ONE_ON_ONE_SENTIMENTS).nullish(),
  topics: z.array(z.enum(ONE_ON_ONE_TOPIC_CODES)).optional(),
  concerns: z.array(z.enum(ONE_ON_ONE_CONCERN_CODES)).optional(),
});

export const oneOnOneActionItemCreateSchema = z.object({
  description: z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(1).max(140)),
  category: z.enum(ONE_ON_ONE_ITEM_CATEGORIES),
  owner: z.enum(ONE_ON_ONE_ITEM_OWNERS).default("instructor"),
  due_by: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .nullish(),
});

export const oneOnOneActionItemUpdateSchema = z.object({
  description: z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(1).max(140))
    .optional(),
  category: z.enum(ONE_ON_ONE_ITEM_CATEGORIES).optional(),
  owner: z.enum(ONE_ON_ONE_ITEM_OWNERS).optional(),
  due_by: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish()
    .optional(),
  status: z.enum(ONE_ON_ONE_ITEM_STATUSES).optional(),
});

export const oneOnOneWorkloadChangeSchema = z.object({
  source_kind: z.enum(ONE_ON_ONE_CHANGE_SOURCE_KINDS),
  source_id: z.string().uuid(),
  change_kind: z.enum(ONE_ON_ONE_CHANGE_KINDS),
  before_value: z.record(z.unknown()).nullish(),
  after_value: z.record(z.unknown()).nullish(),
  rationale_category: z.enum(ONE_ON_ONE_CHANGE_RATIONALES).nullish(),
});

export type OneOnOneTopic = (typeof ONE_ON_ONE_TOPIC_CODES)[number];
export type OneOnOneConcern = (typeof ONE_ON_ONE_CONCERN_CODES)[number];
export type OneOnOneSentiment = (typeof ONE_ON_ONE_SENTIMENTS)[number];
export type OneOnOneItemCategory = (typeof ONE_ON_ONE_ITEM_CATEGORIES)[number];
export type OneOnOneItemOwner = (typeof ONE_ON_ONE_ITEM_OWNERS)[number];
export type OneOnOneItemStatus = (typeof ONE_ON_ONE_ITEM_STATUSES)[number];
export type OneOnOneChangeKind = (typeof ONE_ON_ONE_CHANGE_KINDS)[number];
export type OneOnOneChangeSourceKind = (typeof ONE_ON_ONE_CHANGE_SOURCE_KINDS)[number];
export type OneOnOneChangeRationale = (typeof ONE_ON_ONE_CHANGE_RATIONALES)[number];

export type OneOnOne = {
  id: string;
  org_id: string;
  department_id: string;
  instructor_id: string;
  manager_id: string;
  scheduled_for: string;
  completed_at: string | null;
  sentiment: OneOnOneSentiment | null;
  topics: OneOnOneTopic[];
  concerns: OneOnOneConcern[];
  snapshot_total_hours: number | null;
  snapshot_utilization_pct: number | null;
  snapshot_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  version: number;
};

export type OneOnOneActionItem = {
  id: string;
  one_on_one_id: string;
  org_id: string;
  department_id: string;
  description: string;
  category: OneOnOneItemCategory;
  owner: OneOnOneItemOwner;
  due_by: string | null;
  status: OneOnOneItemStatus;
  resolved_at: string | null;
  resolved_in_one_on_one_id: string | null;
  created_at: string;
  updated_at: string;
};

export type OneOnOneWorkloadChange = {
  id: string;
  one_on_one_id: string;
  org_id: string;
  department_id: string;
  source_kind: OneOnOneChangeSourceKind;
  source_id: string;
  change_kind: OneOnOneChangeKind;
  before_value: Record<string, unknown> | null;
  after_value: Record<string, unknown> | null;
  rationale_category: OneOnOneChangeRationale | null;
  created_at: string;
  actor_id: string | null;
};

// Display labels — keep them in lockstep with the enum codes so the UI never
// needs to invent its own copy.
export const ONE_ON_ONE_TOPIC_LABELS: Record<OneOnOneTopic, string> = {
  workload: "Overall workload",
  class_assignments: "Class assignments",
  recurring_tasks: "Recurring tasks",
  ad_hoc_burden: "Ad-hoc burden",
  pto_planning: "PTO planning",
  coverage_gap: "Coverage gap",
  skill_development: "Skill development",
  project_assignment: "Project assignment",
  other_operational: "Other (operational)",
};

export const ONE_ON_ONE_CONCERN_LABELS: Record<OneOnOneConcern, string> = {
  overallocated: "Overallocated",
  underutilized: "Underutilized",
  burnout_risk: "Burnout risk",
  needs_pto: "Needs PTO",
  skill_gap: "Skill gap",
  schedule_conflict: "Schedule conflict",
  coverage_gap: "Coverage gap",
};

export const ONE_ON_ONE_SENTIMENT_LABELS: Record<OneOnOneSentiment, string> = {
  on_track: "On track",
  watch: "Watch",
  action_needed: "Action needed",
};

export const ONE_ON_ONE_ITEM_CATEGORY_LABELS: Record<OneOnOneItemCategory, string> = {
  reduce_allocation: "Reduce allocation",
  add_coverage: "Add coverage",
  reassign_task: "Reassign task",
  pto_scheduling: "PTO scheduling",
  training_need: "Training need",
  project_assignment: "Project assignment",
  other_operational: "Other (operational)",
};

export const ONE_ON_ONE_CHANGE_RATIONALE_LABELS: Record<OneOnOneChangeRationale, string> = {
  overallocated: "Overallocated",
  underutilized: "Underutilized",
  coverage_gap: "Coverage gap",
  pto_planning: "PTO planning",
  project_rebalance: "Project rebalance",
  task_complete: "Task complete",
  other_operational: "Other (operational)",
};

export type OneOnOneCreate = z.infer<typeof oneOnOneCreateSchema>;
export type OneOnOneUpdate = z.infer<typeof oneOnOneUpdateSchema>;
export type OneOnOneActionItemCreate = z.infer<typeof oneOnOneActionItemCreateSchema>;
export type OneOnOneActionItemUpdate = z.infer<typeof oneOnOneActionItemUpdateSchema>;
export type OneOnOneWorkloadChangeCreate = z.infer<typeof oneOnOneWorkloadChangeSchema>;
