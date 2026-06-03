import { z } from "zod";

// Idempotent: accepts a UUID string OR null OR undefined OR "". Normalizes empty/null → null.
const optionalUuidToNull = z
  .union([z.string().uuid(), z.literal(""), z.null()])
  .nullish()
  .transform((v) => (v === "" || v == null ? null : v));

const classFieldsSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  description: z
    .string()
    .nullish()
    .transform((v) => (v === "" || v == null ? null : v)),
  allocation_bucket_id: optionalUuidToNull,
  module_id: optionalUuidToNull,
  is_multi_day: z.boolean().default(false),
  total_days: z.coerce.number().int().min(1).default(1),
  hours_per_day: z.coerce
    .number()
    .min(0)
    .nullish()
    .transform((v) => v ?? null),
  custom_day_hours: z
    .array(z.coerce.number().min(0, "Hours must be 0 or more"))
    .nullish()
    // An empty array means "no per-day overrides" — same as null. The class
    // form's field array hands us [] for classes that don't use custom hours,
    // and a bare [] would otherwise fail the "exactly N entries" refine below.
    .transform((v) => (v == null || v.length === 0 ? null : v)),
  offerings_per_year: z.coerce.number().int().min(0).default(0),
  prep_hours_per_offering: z.coerce.number().min(0).default(0),
  logistics_hours_per_offering: z.coerce.number().min(0).default(0),
  status: z.enum(["active", "archived"]).default("active"),
});

export const classInputSchema = classFieldsSchema.superRefine((data, ctx) => {
  if (data.is_multi_day && data.total_days < 2) {
    ctx.addIssue({
      code: z.ZodIssueCode.too_small,
      minimum: 2,
      type: "number",
      inclusive: true,
      message: "Multi-day classes must have at least 2 days",
      path: ["total_days"],
    });
  }
  if (
    data.custom_day_hours != null &&
    data.custom_day_hours.length > 0 &&
    data.custom_day_hours.length !== data.total_days
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Custom day hours must have exactly ${String(data.total_days)} entries`,
      path: ["custom_day_hours"],
    });
  }
});

export const classUpdateSchema = classFieldsSchema.partial();

// ── Class modules (a named grouping that holds multiple classes) ─────────────

export const classModuleInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  description: z
    .string()
    .nullish()
    .transform((v) => (v === "" || v == null ? null : v)),
  color: z
    .string()
    .nullish()
    .transform((v) => (v === "" || v == null ? null : v)),
});

export const classModuleUpdateSchema = classModuleInputSchema.partial();

export type ClassModuleInput = z.infer<typeof classModuleInputSchema>;
export type ClassModuleUpdate = z.infer<typeof classModuleUpdateSchema>;

export type ClassModule = {
  id: string;
  org_id: string;
  department_id: string;
  name: string;
  description: string | null;
  color: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export const classInstructorAssignmentSchema = z.object({
  instructor_id: z.string().uuid(),
  role: z.enum(["eligible", "primary", "backup"]).default("eligible"),
  assigned_offerings: z.coerce.number().int().min(0).default(0),
});

// ── Class roadmap (per-class curriculum) ─────────────────────────────────────

export const CLASS_MODALITY_VALUES = [
  "ilt",
  "vilt",
  "elearning",
  "video",
  "reading",
  "simulation",
  "ojt",
  "assessment",
  "blended",
] as const;
export type ClassModality = (typeof CLASS_MODALITY_VALUES)[number];

export const CLASS_MODALITY_LABELS: Record<ClassModality, string> = {
  ilt: "ILT (in-person)",
  vilt: "VILT (virtual)",
  elearning: "eLearning",
  video: "Video",
  reading: "Reading",
  simulation: "Simulation",
  ojt: "On-the-job",
  assessment: "Assessment",
  blended: "Blended",
};

export const classRoadmapStepInputSchema = z.object({
  competency: z.string().trim().min(1, "Competency is required").max(500),
  modality: z.enum(CLASS_MODALITY_VALUES),
  duration_minutes: z.coerce
    .number()
    .int()
    .min(1, "Duration must be at least 1 minute")
    .max(100000),
  notes: z
    .string()
    .nullish()
    .transform((v) => (v === "" || v == null ? null : v)),
});

export const classRoadmapStepUpdateSchema = classRoadmapStepInputSchema.partial();

export type ClassRoadmapStepInput = z.infer<typeof classRoadmapStepInputSchema>;
export type ClassRoadmapStepUpdate = z.infer<typeof classRoadmapStepUpdateSchema>;

export type ClassRoadmapStep = {
  id: string;
  org_id: string;
  department_id: string;
  class_id: string;
  position: number;
  competency: string;
  modality: ClassModality;
  duration_minutes: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ClassInput = z.infer<typeof classInputSchema>;
export type ClassUpdate = z.infer<typeof classUpdateSchema>;
export type ClassInstructorAssignment = z.infer<typeof classInstructorAssignmentSchema>;

export type Class = {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  allocation_bucket_id: string | null;
  module_id: string | null;
  is_multi_day: boolean;
  total_days: number;
  hours_per_day: number | null;
  custom_day_hours: number[] | null;
  offerings_per_year: number;
  prep_hours_per_offering: number;
  logistics_hours_per_offering: number;
  status: "active" | "archived";
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  version: number;
};

export type ClassWithHours = Class & {
  instruction_hours_per_offering: number | null;
  total_hours_per_offering: number | null;
  annual_class_hours: number | null;
};
