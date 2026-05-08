import { z } from "zod";
import { PROJECT_PRIORITY_VALUES, type ProjectPriority } from "./tra";

const emptyToNull = z
  .string()
  .nullish()
  .transform((v) => (v === "" || v == null ? null : v));

const optionalUuid = z
  .union([z.string().uuid(), z.literal(""), z.null()])
  .nullish()
  .transform((v) => (v === "" || v == null ? null : v));

// ── projects ────────────────────────────────────────────────────────────────

export const PROJECT_STATUS_VALUES = [
  "planning",
  "active",
  "on_hold",
  "completed",
  "cancelled",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUS_VALUES)[number];

// PROJECT_PRIORITY_VALUES + ProjectPriority are defined in ./tra (the TRA
// urgency-to-priority mapping needs them); re-exported there.

// Project statuses we treat as "active workload" — only these contribute to
// v_instructor_workload's project_task source. Mirrors the SQL filter so the
// client can preview which projects count.
export const PROJECT_ACTIVE_STATUSES: ProjectStatus[] = ["planning", "active"];

export const projectInsertSchema = z.object({
  name: z.string().min(1, "Project name is required").max(200),
  description: emptyToNull,
  bucket_id: optionalUuid,
  priority: z.enum(PROJECT_PRIORITY_VALUES).default("medium"),
  status: z.enum(PROJECT_STATUS_VALUES).default("planning"),
  start_date: emptyToNull,
  end_date: emptyToNull,
  total_estimated_hours: z
    .union([z.coerce.number().min(0), z.null()])
    .nullish()
    .transform((v) => (v == null ? null : v)),
});

export const projectUpdateSchema = projectInsertSchema.partial();

export type ProjectInput = z.infer<typeof projectInsertSchema>;
export type ProjectUpdate = z.infer<typeof projectUpdateSchema>;

export type Project = {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  bucket_id: string | null;
  priority: ProjectPriority;
  status: ProjectStatus;
  start_date: string | null;
  end_date: string | null;
  total_estimated_hours: number | null;
  source_tra_id: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  version: number;
};

// ── project_team_members ────────────────────────────────────────────────────

export const PROJECT_ROLE_VALUES = ["lead", "member", "reviewer"] as const;
export type ProjectRole = (typeof PROJECT_ROLE_VALUES)[number];

export const teamMemberInsertSchema = z.object({
  instructor_id: z.string().uuid(),
  role: z.enum(PROJECT_ROLE_VALUES).default("member"),
  allocated_hours: z.coerce.number().min(0).default(0),
});

export const teamMemberUpdateSchema = z.object({
  role: z.enum(PROJECT_ROLE_VALUES).optional(),
  allocated_hours: z.coerce.number().min(0).optional(),
});

export type TeamMemberInput = z.infer<typeof teamMemberInsertSchema>;
export type TeamMemberUpdate = z.infer<typeof teamMemberUpdateSchema>;

export type ProjectTeamMember = {
  id: string;
  org_id: string;
  project_id: string;
  instructor_id: string;
  role: ProjectRole;
  allocated_hours: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  version: number;
};

// ── tasks ───────────────────────────────────────────────────────────────────

export const TASK_STATUS_VALUES = ["not_started", "in_progress", "on_hold", "completed"] as const;
export type TaskStatus = (typeof TASK_STATUS_VALUES)[number];

// Task statuses that contribute to workload (matches SQL view filter).
export const TASK_ACTIVE_STATUSES: TaskStatus[] = ["not_started", "in_progress"];

export const TASK_PRIORITY_VALUES = ["low", "medium", "high", "critical"] as const;
export type TaskPriority = (typeof TASK_PRIORITY_VALUES)[number];

export const taskInsertSchema = z.object({
  name: z.string().min(1, "Task name is required").max(200),
  description: emptyToNull,
  status: z.enum(TASK_STATUS_VALUES).default("not_started"),
  priority: z.enum(TASK_PRIORITY_VALUES).default("medium"),
  start_date: emptyToNull,
  end_date: emptyToNull,
  estimated_hours: z
    .union([z.coerce.number().min(0), z.null()])
    .nullish()
    .transform((v) => (v == null ? null : v)),
  actual_hours: z
    .union([z.coerce.number().min(0), z.null()])
    .nullish()
    .transform((v) => (v == null ? null : v)),
  percent_complete: z.coerce.number().int().min(0).max(100).default(0),
  sort_order: z.coerce.number().int().default(0),
});

export const taskUpdateSchema = taskInsertSchema.partial();

export type TaskInput = z.infer<typeof taskInsertSchema>;
export type TaskUpdate = z.infer<typeof taskUpdateSchema>;

export type Task = {
  id: string;
  org_id: string;
  project_id: string;
  name: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  start_date: string | null;
  end_date: string | null;
  estimated_hours: number | null;
  actual_hours: number | null;
  percent_complete: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  version: number;
};

// ── task_assignments ────────────────────────────────────────────────────────

export const taskAssignmentInsertSchema = z.object({
  project_team_member_id: z.string().uuid(),
  allocated_hours: z.coerce.number().min(0).default(0),
});

export const taskAssignmentUpdateSchema = z.object({
  allocated_hours: z.coerce.number().min(0).optional(),
});

export type TaskAssignmentInput = z.infer<typeof taskAssignmentInsertSchema>;
export type TaskAssignmentUpdate = z.infer<typeof taskAssignmentUpdateSchema>;

export type TaskAssignment = {
  id: string;
  org_id: string;
  task_id: string;
  project_team_member_id: string;
  allocated_hours: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

// ── task_action_items ───────────────────────────────────────────────────────

export const actionItemInsertSchema = z.object({
  description: z.string().min(1, "Description is required").max(500),
  assigned_to_team_member_id: optionalUuid,
  due_date: emptyToNull,
  is_complete: z.coerce.boolean().default(false),
  sort_order: z.coerce.number().int().default(0),
});

export const actionItemUpdateSchema = actionItemInsertSchema.partial();

export type ActionItemInput = z.infer<typeof actionItemInsertSchema>;
export type ActionItemUpdate = z.infer<typeof actionItemUpdateSchema>;

export type TaskActionItem = {
  id: string;
  org_id: string;
  task_id: string;
  description: string;
  assigned_to_team_member_id: string | null;
  is_complete: boolean;
  completed_at: string | null;
  due_date: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  version: number;
};

// ── progress helpers ────────────────────────────────────────────────────────

// Project % complete = average of task percent_complete values (excluding
// archived/deleted tasks). Returns null when there are no tasks (so the UI
// can show "—" instead of 0%).
export function projectPercentComplete(tasks: { percent_complete: number }[]): number | null {
  if (tasks.length === 0) return null;
  const sum = tasks.reduce((acc, t) => acc + (t.percent_complete || 0), 0);
  return Math.round(sum / tasks.length);
}

// Status badge → bucket: a task in 'completed' is 100% even if percent_complete
// wasn't explicitly set. Useful when the UI shows a checkbox + percent slider
// and we want completion to win.
export function effectiveTaskPercent(t: { status: TaskStatus; percent_complete: number }): number {
  if (t.status === "completed") return 100;
  return t.percent_complete;
}
