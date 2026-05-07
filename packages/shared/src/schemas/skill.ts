import { z } from "zod";

// Idempotent: accepts string | null | undefined, normalizes "" / null / undefined → null.
// Must accept null because zodResolver runs this schema on the client (turning "" → null),
// then the server action re-runs the same schema on the parsed payload.
const emptyToNull = z
  .string()
  .nullish()
  .transform((v) => (v === "" || v == null ? null : v));

export const PROFICIENCY_VALUES = ["beginner", "intermediate", "advanced", "expert"] as const;

export type Proficiency = (typeof PROFICIENCY_VALUES)[number];

export const PROFICIENCY_RANK: Record<Proficiency, number> = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
  expert: 4,
};

export const REQUIREMENT_VALUES = ["required", "preferred"] as const;
export type Requirement = (typeof REQUIREMENT_VALUES)[number];

// ── skills ──────────────────────────────────────────────────────────────────

export const skillInsertSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  category: emptyToNull,
  description: emptyToNull,
  is_certification: z.boolean().default(false),
  certifying_authority: emptyToNull,
  is_archived: z.boolean().default(false),
});

export const skillUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  category: emptyToNull.optional(),
  description: emptyToNull.optional(),
  is_certification: z.boolean().optional(),
  certifying_authority: emptyToNull.optional(),
  is_archived: z.boolean().optional(),
});

export type SkillInsert = z.infer<typeof skillInsertSchema>;
export type SkillUpdate = z.infer<typeof skillUpdateSchema>;

export type Skill = {
  id: string;
  org_id: string;
  name: string;
  category: string | null;
  description: string | null;
  is_certification: boolean;
  certifying_authority: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

// ── instructor_skills ───────────────────────────────────────────────────────

export const instructorSkillSchema = z
  .object({
    skill_id: z.string().uuid(),
    proficiency: z.enum(PROFICIENCY_VALUES),
    is_certified: z.boolean().default(false),
    certified_at: emptyToNull,
    expires_at: emptyToNull,
    certificate_url: emptyToNull,
    notes: emptyToNull,
  })
  .superRefine((data, ctx) => {
    if (data.is_certified && !data.certified_at) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Certification date is required when certified",
        path: ["certified_at"],
      });
    }
  });

export const instructorSkillUpdateSchema = z.object({
  proficiency: z.enum(PROFICIENCY_VALUES).optional(),
  is_certified: z.boolean().optional(),
  certified_at: emptyToNull.optional(),
  expires_at: emptyToNull.optional(),
  certificate_url: emptyToNull.optional(),
  notes: emptyToNull.optional(),
});

export type InstructorSkillInput = z.infer<typeof instructorSkillSchema>;
export type InstructorSkillUpdate = z.infer<typeof instructorSkillUpdateSchema>;

export type InstructorSkill = {
  id: string;
  org_id: string;
  instructor_id: string;
  skill_id: string;
  proficiency: Proficiency;
  is_certified: boolean;
  certified_at: string | null;
  expires_at: string | null;
  certificate_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

// ── class_skill_requirements ────────────────────────────────────────────────

export const classSkillRequirementSchema = z.object({
  skill_id: z.string().uuid(),
  min_proficiency: z.enum(PROFICIENCY_VALUES),
  requirement: z.enum(REQUIREMENT_VALUES).default("required"),
});

export const classSkillRequirementUpdateSchema = z.object({
  min_proficiency: z.enum(PROFICIENCY_VALUES).optional(),
  requirement: z.enum(REQUIREMENT_VALUES).optional(),
});

export type ClassSkillRequirementInput = z.infer<typeof classSkillRequirementSchema>;
export type ClassSkillRequirementUpdate = z.infer<typeof classSkillRequirementUpdateSchema>;

export type ClassSkillRequirement = {
  id: string;
  org_id: string;
  class_id: string;
  skill_id: string;
  min_proficiency: Proficiency;
  requirement: Requirement;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};
