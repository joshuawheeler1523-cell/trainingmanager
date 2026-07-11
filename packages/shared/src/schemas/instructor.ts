import { z } from "zod";

// Idempotent: accepts string | null | undefined, normalizes "" / null / undefined → null.
// Must accept null on the server because zodResolver runs this schema on the client first
// (turning "" → null), then the server action re-runs the same schema on the parsed payload.
const emptyToNull = z
  .string()
  .nullish()
  .transform((v) => (v === "" || v == null ? null : v));

export const instructorInsertSchema = z.object({
  full_name: z.string().min(1, "Name is required").max(200),
  email: z
    .string()
    .nullish()
    .transform((v) => (v === "" || v == null ? null : v))
    .pipe(z.string().email("Must be a valid email address").nullable()),
  phone: emptyToNull,
  department: emptyToNull,
  location: emptyToNull,
  job_title: emptyToNull,
  start_date: emptyToNull,
  annual_hours: z.coerce.number().int().min(0).max(4000).default(1880),
  status: z.enum(["active", "inactive", "on_leave"]).default("active"),
  notes: emptyToNull,
  is_external: z.coerce.boolean().default(false),
});

export const instructorUpdateSchema = z.object({
  full_name: z.string().min(1).max(200).optional(),
  email: z
    .string()
    .nullish()
    .transform((v) => (v === "" || v == null ? null : v))
    .pipe(z.string().email("Must be a valid email address").nullable().optional()),
  phone: emptyToNull.optional(),
  department: emptyToNull.optional(),
  location: emptyToNull.optional(),
  job_title: emptyToNull.optional(),
  start_date: emptyToNull.optional(),
  annual_hours: z.coerce.number().int().min(0).max(4000).optional(),
  status: z.enum(["active", "inactive", "on_leave"]).optional(),
  notes: emptyToNull.optional(),
  is_external: z.coerce.boolean().optional(),
});

export const externalInstructorCreateSchema = z.object({
  full_name: z.string().min(1, "Name is required").max(200),
  email: z
    .string()
    .nullish()
    .transform((v) => (v === "" || v == null ? null : v))
    .pipe(z.string().email("Must be a valid email address").nullable()),
  notes: emptyToNull,
});

export const externalInstructorUpdateSchema = z.object({
  full_name: z.string().min(1, "Name is required").max(200).optional(),
  email: z
    .string()
    .nullish()
    .transform((v) => (v === "" || v == null ? null : v))
    .pipe(z.string().email("Must be a valid email address").nullable().optional()),
});

export type ExternalInstructorCreate = z.infer<typeof externalInstructorCreateSchema>;
export type ExternalInstructorUpdate = z.infer<typeof externalInstructorUpdateSchema>;

export type InstructorInsert = z.infer<typeof instructorInsertSchema>;
export type InstructorUpdate = z.infer<typeof instructorUpdateSchema>;

export type Instructor = {
  id: string;
  org_id: string;
  department_id: string;
  user_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  location: string | null;
  job_title: string | null;
  start_date: string | null;
  annual_hours: number;
  status: "active" | "inactive" | "on_leave";
  notes: string | null;
  is_external: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  version: number;
};
