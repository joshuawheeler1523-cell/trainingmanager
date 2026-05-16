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

const optionalUuid = z
  .string()
  .nullish()
  .transform((v) => (v === "" || v == null ? null : v))
  .pipe(z.string().uuid().nullable());

export const superUserInsertSchema = z
  .object({
    full_name: trimmedString(200),
    email: optionalText,
    phone: optionalText,
    unit: optionalText,
    class_id: optionalUuid,
    topic: optionalText,
    trained_at: optionalDate,
  })
  .refine((v) => v.class_id != null || (typeof v.topic === "string" && v.topic.length > 0), {
    message: "Either link a class or enter a topic",
    path: ["topic"],
  });

export const superUserUpdateSchema = z
  .object({
    full_name: trimmedString(200).optional(),
    email: optionalText.optional(),
    phone: optionalText.optional(),
    unit: optionalText.optional(),
    class_id: optionalUuid.optional(),
    topic: optionalText.optional(),
    trained_at: optionalDate.optional(),
  })
  .refine(
    (v) => {
      const hasClass = v.class_id !== undefined ? v.class_id != null : true;
      const hasTopic =
        v.topic !== undefined ? typeof v.topic === "string" && v.topic.length > 0 : true;
      if (v.class_id === null && v.topic === null) return false;
      if (v.class_id === null && v.topic === undefined) return false;
      return hasClass || hasTopic;
    },
    { message: "Either link a class or enter a topic", path: ["topic"] },
  );

export type SuperUserInsert = z.infer<typeof superUserInsertSchema>;
export type SuperUserUpdate = z.infer<typeof superUserUpdateSchema>;

export type SuperUser = {
  id: string;
  org_id: string;
  department_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  unit: string | null;
  class_id: string | null;
  topic: string | null;
  trained_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  version: number;
};

export type SuperUserWithClass = SuperUser & {
  class_name: string | null;
};

// ── Implementation-scoped super users ────────────────────────────────────────

export const implSuperUserInsertSchema = z
  .object({
    full_name: trimmedString(200),
    email: optionalText,
    phone: optionalText,
    unit: optionalText,
    impl_class_id: optionalUuid,
    topic: optionalText,
    trained_at: optionalDate,
  })
  .refine((v) => v.impl_class_id != null || (typeof v.topic === "string" && v.topic.length > 0), {
    message: "Either link a class or enter a topic",
    path: ["topic"],
  });

export const implSuperUserUpdateSchema = z
  .object({
    full_name: trimmedString(200).optional(),
    email: optionalText.optional(),
    phone: optionalText.optional(),
    unit: optionalText.optional(),
    impl_class_id: optionalUuid.optional(),
    topic: optionalText.optional(),
    trained_at: optionalDate.optional(),
  })
  .refine(
    (v) => {
      if (v.impl_class_id === null && v.topic === null) return false;
      if (v.impl_class_id === null && v.topic === undefined) return false;
      return true;
    },
    { message: "Either link a class or enter a topic", path: ["topic"] },
  );

export type ImplSuperUserInsert = z.infer<typeof implSuperUserInsertSchema>;
export type ImplSuperUserUpdate = z.infer<typeof implSuperUserUpdateSchema>;

export type ImplSuperUser = {
  id: string;
  org_id: string;
  department_id: string;
  implementation_id: string;
  impl_class_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  unit: string | null;
  topic: string | null;
  trained_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  version: number;
};

export type ImplSuperUserWithClass = ImplSuperUser & {
  impl_class_name: string | null;
};
