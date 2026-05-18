import { z } from "zod";

const emptyToNull = z
  .string()
  .nullish()
  .transform((v) => (v === "" || v == null ? null : v));

const optionalUuid = z
  .union([z.string().uuid(), z.literal(""), z.null()])
  .nullish()
  .transform((v) => (v === "" || v == null ? null : v));

// ── implementations ─────────────────────────────────────────────────────────

export const IMPL_STATUS_VALUES = [
  "draft",
  "active",
  "completed",
  "archived",
  "cancelled",
] as const;
export type ImplStatus = (typeof IMPL_STATUS_VALUES)[number];

export const IMPL_STEPS = [
  "setup",
  "rooms",
  "trainers",
  "modules",
  "classes",
  "calculate",
  "schedule",
] as const;
export type ImplStep = (typeof IMPL_STEPS)[number];

export const implementationInsertSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  description: emptyToNull,
  bucket_id: z.string().uuid("Pick a bucket"),
  window_start_date: emptyToNull,
  window_end_date: emptyToNull,
  go_live_date: emptyToNull,
  linked_project_id: optionalUuid,
  linked_tra_id: optionalUuid,
  lunch_break_start_minutes: z.coerce.number().int().min(0).max(1439).default(720),
  lunch_break_length_minutes: z.coerce.number().int().min(0).max(240).default(60),
  go_live_buffer_days: z.coerce.number().int().min(0).max(365).default(7),
  business_hours_start_local: z.coerce.number().min(0).max(24).default(0),
  business_hours_end_local: z.coerce.number().min(0).max(24).default(24),
});

// Setup-step validation: dates required to leave Step 1.
export const implementationSetupSchema = z
  .object({
    name: z.string().min(1, "Name is required").max(200),
    description: emptyToNull,
    bucket_id: z.string().uuid("Pick a bucket"),
    window_start_date: z.string().min(1, "Window start is required"),
    window_end_date: z.string().min(1, "Window end is required"),
    go_live_date: z.string().min(1, "Go-live date is required"),
    linked_project_id: optionalUuid,
    linked_tra_id: optionalUuid,
    lunch_break_start_minutes: z.coerce.number().int().min(0).max(1439).default(720),
    lunch_break_length_minutes: z.coerce.number().int().min(0).max(240).default(60),
    go_live_buffer_days: z.coerce.number().int().min(0).max(365).default(7),
    business_hours_start_local: z.coerce.number().min(0).max(24).default(0),
    business_hours_end_local: z.coerce.number().min(0).max(24).default(24),
  })
  .refine((v) => v.business_hours_end_local > v.business_hours_start_local, {
    message: "Business hours end must be after start",
    path: ["business_hours_end_local"],
  });

export const implementationUpdateSchema = implementationInsertSchema.partial().extend({
  status: z.enum(IMPL_STATUS_VALUES).optional(),
  current_step: z.coerce.number().int().min(1).max(7).optional(),
});

export type ImplementationInput = z.infer<typeof implementationInsertSchema>;
export type ImplementationSetupInput = z.infer<typeof implementationSetupSchema>;
export type ImplementationUpdate = z.infer<typeof implementationUpdateSchema>;

export type Implementation = {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  bucket_id: string | null;
  window_start_date: string | null;
  window_end_date: string | null;
  go_live_date: string | null;
  linked_project_id: string | null;
  linked_tra_id: string | null;
  status: ImplStatus;
  current_step: number;
  lunch_break_start_minutes: number;
  lunch_break_length_minutes: number;
  go_live_buffer_days: number;
  business_hours_start_local: number;
  business_hours_end_local: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  version: number;
};

// ── impl_rooms ──────────────────────────────────────────────────────────────

export const implRoomInsertSchema = z.object({
  name: z.string().min(1, "Room name is required").max(200),
  location: emptyToNull,
  seat_capacity: z.coerce.number().int().min(1, "At least 1 seat"),
  available_hours_per_day: z.coerce.number().min(0.5).max(24).default(8),
  available_days_of_week: z.array(z.coerce.number().int().min(0).max(6)).default([1, 2, 3, 4, 5]),
  start_hour_local: z.coerce.number().min(0).max(23.99).default(9.0),
  timezone: emptyToNull,
  equipment_tags: z.array(z.string().min(1).max(60)).default([]),
  equipment_notes: emptyToNull,
  sort_order: z.coerce.number().int().default(0),
});

export const implRoomUpdateSchema = implRoomInsertSchema.partial();

export type ImplRoomInput = z.infer<typeof implRoomInsertSchema>;
export type ImplRoomUpdate = z.infer<typeof implRoomUpdateSchema>;

export type ImplRoom = {
  id: string;
  org_id: string;
  implementation_id: string;
  name: string;
  location: string | null;
  seat_capacity: number;
  available_hours_per_day: number;
  available_days_of_week: number[];
  start_hour_local: number;
  timezone: string | null;
  equipment_tags: string[];
  equipment_notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

// ── impl_trainers ───────────────────────────────────────────────────────────

export const implTrainerInsertSchema = z.object({
  instructor_id: optionalUuid,
  name: z.string().min(1, "Trainer name is required").max(200),
  email: emptyToNull,
  availability_hours_per_week: z.coerce
    .number()
    .min(1, "Trainer must have at least 1 hour/week available"),
  max_concurrent_sessions: z.coerce.number().int().min(1).default(1),
  sort_order: z.coerce.number().int().default(0),
});

export const implTrainerUpdateSchema = implTrainerInsertSchema.partial();

export type ImplTrainerInput = z.infer<typeof implTrainerInsertSchema>;
export type ImplTrainerUpdate = z.infer<typeof implTrainerUpdateSchema>;

export type ImplTrainer = {
  id: string;
  org_id: string;
  implementation_id: string;
  instructor_id: string | null;
  name: string;
  email: string | null;
  availability_hours_per_week: number;
  max_concurrent_sessions: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

// ── impl_trainer_unavailability (PTO / time off) ────────────────────────────

export const implTrainerUnavailabilityInsertSchema = z
  .object({
    starts_at: z.string().min(1, "Start is required"),
    ends_at: z.string().min(1, "End is required"),
    reason: emptyToNull,
  })
  .superRefine((data, ctx) => {
    if (data.starts_at && data.ends_at && data.ends_at <= data.starts_at) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "End must be after start",
        path: ["ends_at"],
      });
    }
  });

export const implTrainerUnavailabilityUpdateSchema = z
  .object({
    starts_at: z.string().optional(),
    ends_at: z.string().optional(),
    reason: emptyToNull,
  })
  .superRefine((data, ctx) => {
    if (data.starts_at && data.ends_at && data.ends_at <= data.starts_at) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "End must be after start",
        path: ["ends_at"],
      });
    }
  });

export type ImplTrainerUnavailabilityInput = z.infer<typeof implTrainerUnavailabilityInsertSchema>;
export type ImplTrainerUnavailabilityUpdate = z.infer<typeof implTrainerUnavailabilityUpdateSchema>;

export type ImplTrainerUnavailability = {
  id: string;
  org_id: string;
  department_id: string;
  impl_trainer_id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
  created_at: string;
  updated_at: string;
};

// ── impl_modules ────────────────────────────────────────────────────────────

export const implModuleInsertSchema = z.object({
  name: z.string().min(1, "Module name is required").max(200),
  description: emptyToNull,
  sort_order: z.coerce.number().int().default(0),
});

export const implModuleUpdateSchema = implModuleInsertSchema.partial();

export type ImplModuleInput = z.infer<typeof implModuleInsertSchema>;
export type ImplModuleUpdate = z.infer<typeof implModuleUpdateSchema>;

export type ImplModule = {
  id: string;
  org_id: string;
  implementation_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

// ── impl_classes ────────────────────────────────────────────────────────────

export const implClassInsertSchema = z.object({
  module_id: optionalUuid,
  name: z.string().min(1, "Class name is required").max(200),
  description: emptyToNull,
  hours_per_session: z.coerce.number().min(0.25, "Must be at least 0.25 hours"),
  expected_learners_per_session: z.coerce.number().int().min(1, "At least 1 learner"),
  total_people_to_train: z.coerce.number().int().min(0).default(0),
  required_equipment_tags: z.array(z.string().min(1).max(60)).default([]),
  required_equipment_notes: emptyToNull,
  sort_order: z.coerce.number().int().default(0),
});

export const implClassUpdateSchema = implClassInsertSchema.partial();

export type ImplClassInput = z.infer<typeof implClassInsertSchema>;
export type ImplClassUpdate = z.infer<typeof implClassUpdateSchema>;

export type ImplClass = {
  id: string;
  org_id: string;
  implementation_id: string;
  module_id: string | null;
  name: string;
  description: string | null;
  hours_per_session: number;
  expected_learners_per_session: number;
  total_people_to_train: number;
  required_equipment_tags: string[];
  required_equipment_notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

// ── junctions ───────────────────────────────────────────────────────────────

export type ImplClassTrainer = {
  id: string;
  org_id: string;
  impl_class_id: string;
  impl_trainer_id: string;
  created_at: string;
  created_by: string | null;
};

export type ImplClassPrerequisite = {
  id: string;
  org_id: string;
  impl_class_id: string;
  prerequisite_id: string;
  created_at: string;
  created_by: string | null;
};

// ── impl_sessions ───────────────────────────────────────────────────────────

export const SESSION_STATUS_VALUES = ["draft", "published", "cancelled"] as const;
export type SessionStatus = (typeof SESSION_STATUS_VALUES)[number];

export const SESSION_CONFLICT_VALUES = ["none", "partial", "full"] as const;
export type SessionConflict = (typeof SESSION_CONFLICT_VALUES)[number];

export type ImplSession = {
  id: string;
  org_id: string;
  implementation_id: string;
  impl_class_id: string;
  impl_trainer_id: string | null;
  impl_room_id: string | null;
  scheduled_start: string;
  scheduled_end: string;
  learners_count: number;
  status: SessionStatus;
  conflict_status: SessionConflict;
  conflict_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

// ── helpers ─────────────────────────────────────────────────────────────────

// sessions_needed = ceil(total_people / expected_per_session). Returns 0 when
// nobody needs training (so the wizard can show "no sessions yet" without
// dividing by zero on a brand-new class).
export function sessionsNeeded(c: {
  total_people_to_train: number;
  expected_learners_per_session: number;
}): number {
  if (c.total_people_to_train <= 0) return 0;
  if (c.expected_learners_per_session <= 0) return 0;
  return Math.ceil(c.total_people_to_train / c.expected_learners_per_session);
}

// Implementation completion % across all classes:
//   sum(min(scheduled_sessions, sessions_needed)) / sum(sessions_needed)
// Returns null when no class needs sessions (so list view can show "—").
export function implementationCompletion(args: {
  classes: { id: string; total_people_to_train: number; expected_learners_per_session: number }[];
  sessionsByClass: Map<string, number>;
}): number | null {
  let need = 0;
  let have = 0;
  for (const c of args.classes) {
    const n = sessionsNeeded(c);
    if (n === 0) continue;
    need += n;
    have += Math.min(args.sessionsByClass.get(c.id) ?? 0, n);
  }
  if (need === 0) return null;
  return Math.round((have / need) * 100);
}
