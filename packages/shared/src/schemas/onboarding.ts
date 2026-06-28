import { z } from "zod";

const trimmedString = (max: number) =>
  z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(1).max(max));

const optionalText = z
  .string()
  .nullish()
  .transform((v) => (v === "" || v == null ? null : v.trim()));

const optionalDate = z
  .string()
  .nullish()
  .transform((v) => (v === "" || v == null ? null : v))
  .pipe(
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
      .nullable(),
  );

export const ONBOARDING_STATUSES = ["not_started", "in_progress", "done"] as const;
export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];

// ── Tasks (checklist columns) ────────────────────────────────────────────────

export const onboardingTaskInsertSchema = z.object({
  name: trimmedString(200),
  description: optionalText,
  sort_order: z.number().int().optional(),
});

export const onboardingTaskUpdateSchema = z.object({
  name: trimmedString(200).optional(),
  description: optionalText.optional(),
  sort_order: z.number().int().optional(),
});

export type OnboardingTaskInsert = z.infer<typeof onboardingTaskInsertSchema>;
export type OnboardingTaskUpdate = z.infer<typeof onboardingTaskUpdateSchema>;

export type OnboardingTask = {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  version: number;
};

// ── Progress (grid cells) ────────────────────────────────────────────────────

export const onboardingProgressUpsertSchema = z.object({
  instructor_id: z.string().uuid(),
  task_id: z.string().uuid(),
  status: z.enum(ONBOARDING_STATUSES),
  completed_at: optionalDate,
  notes: optionalText,
});

export type OnboardingProgressUpsert = z.infer<typeof onboardingProgressUpsertSchema>;

export type OnboardingProgress = {
  id: string;
  org_id: string;
  instructor_id: string;
  task_id: string;
  status: OnboardingStatus;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  version: number;
};
