import { z } from "zod";

const emptyToNull = z
  .string()
  .nullish()
  .transform((v) => (v === "" || v == null ? null : v));

export const TRA_URGENCY_VALUES = ["low", "standard", "high", "urgent"] as const;
export type TraUrgency = (typeof TRA_URGENCY_VALUES)[number];

export const TRA_STATUS_VALUES = [
  "draft",
  "submitted",
  "approved",
  "converted",
  "rejected",
] as const;
export type TraStatus = (typeof TRA_STATUS_VALUES)[number];

export const PROJECT_PRIORITY_VALUES = ["low", "medium", "high", "critical"] as const;
export type ProjectPriority = (typeof PROJECT_PRIORITY_VALUES)[number];

// TRA urgency → project priority. Low → low, standard → medium,
// high → high, urgent → critical. Used by convertTraToProject.
export function traUrgencyToProjectPriority(urgency: TraUrgency): ProjectPriority {
  switch (urgency) {
    case "low":
      return "low";
    case "standard":
      return "medium";
    case "high":
      return "high";
    case "urgent":
      return "critical";
  }
}

// ── tras ────────────────────────────────────────────────────────────────────

export const traInsertSchema = z.object({
  project_name: z.string().min(1, "Project name is required").max(200),
  description: emptyToNull,
  requesting_department: emptyToNull,
  stakeholder_name: emptyToNull,
  stakeholder_email: z
    .string()
    .nullish()
    .transform((v) => (v === "" || v == null ? null : v))
    .pipe(z.string().email("Must be a valid email address").nullable()),
  business_justification: emptyToNull,
  target_audience: emptyToNull,
  urgency: z.enum(TRA_URGENCY_VALUES).default("standard"),
  adjustments_notes: emptyToNull,
  ai_assistant_used: z.boolean().default(false),
});

export const traUpdateSchema = traInsertSchema.partial();

export type TraInput = z.infer<typeof traInsertSchema>;
export type TraUpdate = z.infer<typeof traUpdateSchema>;

export type Tra = {
  id: string;
  org_id: string;
  project_name: string;
  description: string | null;
  requesting_department: string | null;
  stakeholder_name: string | null;
  stakeholder_email: string | null;
  business_justification: string | null;
  target_audience: string | null;
  urgency: TraUrgency;
  status: TraStatus;
  total_estimated_hours: number;
  adjustments_notes: string | null;
  converted_to_project_id: string | null;
  ai_assistant_used: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

// ── tra_deliverables ────────────────────────────────────────────────────────

export const deliverableInsertSchema = z.object({
  deliverable_type_id: z.string().uuid(),
  name: z.string().min(1, "Deliverable name is required").max(200),
  seat_time_hours: z.coerce.number().min(0),
  quantity: z.coerce.number().int().min(1).default(1),
  complexity_multiplier: z.coerce.number().min(0.5).max(3.0).default(1.0),
  notes: emptyToNull,
});

export const deliverableUpdateSchema = deliverableInsertSchema.partial();

export type DeliverableInput = z.infer<typeof deliverableInsertSchema>;
export type DeliverableUpdate = z.infer<typeof deliverableUpdateSchema>;

export type TraDeliverable = {
  id: string;
  org_id: string;
  tra_id: string;
  deliverable_type_id: string;
  name: string;
  seat_time_hours: number;
  quantity: number;
  complexity_multiplier: number;
  estimated_hours: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

// ── deliverable_types (catalog) ─────────────────────────────────────────────

export type DeliverableType = {
  id: string;
  org_id: string | null;
  name: string;
  dev_to_seat_ratio: number;
  description: string | null;
  is_built_in: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

// Pure helper that mirrors the SQL trigger formula:
//   seat_time_hours * dev_to_seat_ratio * quantity * complexity_multiplier
export function computeDeliverableEstimatedHours(args: {
  seat_time_hours: number;
  dev_to_seat_ratio: number;
  quantity: number;
  complexity_multiplier: number;
}): number {
  return args.seat_time_hours * args.dev_to_seat_ratio * args.quantity * args.complexity_multiplier;
}
