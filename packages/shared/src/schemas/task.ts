import { z } from "zod";

const emptyToNull = z
  .string()
  .nullish()
  .transform((v) => (v === "" || v == null ? null : v));

export const FREQUENCY_VALUES = [
  "daily",
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "annually",
] as const;
export type Frequency = (typeof FREQUENCY_VALUES)[number];

// Default occurrences per year for each frequency. Mirrors the SQL
// `frequency_to_annual()` helper so the client can preview totals before save.
export const FREQUENCY_TO_ANNUAL: Record<Frequency, number> = {
  daily: 250,
  weekly: 52,
  biweekly: 26,
  monthly: 12,
  quarterly: 4,
  annually: 1,
};

export const RECURRING_STATUS_VALUES = ["active", "paused", "archived"] as const;
export type RecurringStatus = (typeof RECURRING_STATUS_VALUES)[number];

export const ADHOC_STATUS_VALUES = ["open", "in_progress", "done", "cancelled"] as const;
export type AdHocStatus = (typeof ADHOC_STATUS_VALUES)[number];

// ── recurring_tasks ─────────────────────────────────────────────────────────

const optionalUuid = z
  .union([z.string().uuid(), z.literal(""), z.null()])
  .nullish()
  .transform((v) => (v === "" || v == null ? null : v));

const optionalNonNegInt = z
  .union([z.coerce.number().int().min(0), z.null()])
  .nullish()
  .transform((v) => (v == null ? null : v));

export const recurringTaskInsertSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  description: emptyToNull,
  bucket_id: optionalUuid,
  hours_per_occurrence: z.coerce.number().min(0),
  frequency: z.enum(FREQUENCY_VALUES),
  occurrences_per_year: optionalNonNegInt,
  status: z.enum(RECURRING_STATUS_VALUES).default("active"),
});

export const recurringTaskUpdateSchema = recurringTaskInsertSchema.partial();

export type RecurringTaskInput = z.infer<typeof recurringTaskInsertSchema>;
export type RecurringTaskUpdate = z.infer<typeof recurringTaskUpdateSchema>;

export type RecurringTask = {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  bucket_id: string | null;
  hours_per_occurrence: number;
  frequency: Frequency;
  occurrences_per_year: number | null;
  status: RecurringStatus;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

// Resolves the effective occurrences per year for a recurring task: explicit
// override if set, otherwise the per-frequency default.
export function effectiveOccurrencesPerYear(t: {
  frequency: Frequency;
  occurrences_per_year: number | null;
}): number {
  return t.occurrences_per_year ?? FREQUENCY_TO_ANNUAL[t.frequency];
}

// Effective annual hours for a recurring task. share_percent is the per-assignee
// slice (0–100); pass 100 for the unsharded total.
export function recurringAnnualHours(args: {
  frequency: Frequency;
  occurrences_per_year: number | null;
  hours_per_occurrence: number;
  share_percent?: number;
}): number {
  const occ = effectiveOccurrencesPerYear(args);
  const share = args.share_percent ?? 100;
  return args.hours_per_occurrence * occ * (share / 100);
}

// ── recurring_task_assignments ──────────────────────────────────────────────

const sharePercentSchema = z.coerce.number().min(0).max(100);

// Slate of (instructor_id, share_percent) tuples for one recurring_task.
// Validated to sum to exactly 100 across the slate.
export const recurringAssignmentSlateSchema = z
  .array(
    z.object({
      instructor_id: z.string().uuid(),
      share_percent: sharePercentSchema,
    }),
  )
  .superRefine((rows, ctx) => {
    if (rows.length === 0) return; // no assignments is allowed (unassigned task)
    const sum = rows.reduce((acc, r) => acc + (r.share_percent || 0), 0);
    const rounded = Math.round(sum * 100) / 100;
    if (Math.abs(rounded - 100) > 0.005) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Share percentages must sum to 100% (got ${rounded.toFixed(1)}%).`,
        path: [0, "share_percent"],
      });
    }
  });

export type RecurringAssignmentSlate = z.infer<typeof recurringAssignmentSlateSchema>;

export type RecurringTaskAssignment = {
  recurring_task_id: string;
  instructor_id: string;
  org_id: string;
  share_percent: number;
  created_at: string;
};

// ── ad_hoc_tasks ─────────────────────────────────────────────────────────────

export const adHocTaskInsertSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  description: emptyToNull,
  bucket_id: optionalUuid,
  instructor_id: optionalUuid,
  hours: z.coerce.number().min(0),
  due_date: emptyToNull,
  status: z.enum(ADHOC_STATUS_VALUES).default("open"),
});

export const adHocTaskUpdateSchema = adHocTaskInsertSchema.partial();

export type AdHocTaskInput = z.infer<typeof adHocTaskInsertSchema>;
export type AdHocTaskUpdate = z.infer<typeof adHocTaskUpdateSchema>;

export type AdHocTask = {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  bucket_id: string | null;
  instructor_id: string | null;
  hours: number;
  due_date: string | null;
  status: AdHocStatus;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};
