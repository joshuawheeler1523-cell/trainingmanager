import { z } from "zod";

const classFieldsSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  description: z
    .string()
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  allocation_bucket_id: z
    .string()
    .uuid()
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  is_multi_day: z.boolean().default(false),
  total_days: z.coerce.number().int().min(1).default(1),
  hours_per_day: z.coerce
    .number()
    .min(0)
    .optional()
    .nullable()
    .transform((v) => v ?? null),
  custom_day_hours: z
    .array(z.coerce.number().min(0, "Hours must be 0 or more"))
    .optional()
    .nullable()
    .transform((v) => v ?? null),
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
  if (data.custom_day_hours !== null && data.custom_day_hours.length !== data.total_days) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Custom day hours must have exactly ${String(data.total_days)} entries`,
      path: ["custom_day_hours"],
    });
  }
});

export const classUpdateSchema = classFieldsSchema.partial();

export const classInstructorAssignmentSchema = z.object({
  instructor_id: z.string().uuid(),
  role: z.enum(["eligible", "primary", "backup"]).default("eligible"),
  assigned_offerings: z.coerce.number().int().min(0).default(0),
});

export type ClassInput = z.infer<typeof classInputSchema>;
export type ClassUpdate = z.infer<typeof classUpdateSchema>;
export type ClassInstructorAssignment = z.infer<typeof classInstructorAssignmentSchema>;

export type Class = {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  allocation_bucket_id: string | null;
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
