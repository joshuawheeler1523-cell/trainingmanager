import { z } from "zod";

export const createOrgSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, or hyphens"),
});

export type CreateOrgInput = z.infer<typeof createOrgSchema>;
