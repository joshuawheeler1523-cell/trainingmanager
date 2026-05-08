import { z } from "zod";

const emptyToNull = z
  .string()
  .nullish()
  .transform((v) => (v === "" || v == null ? null : v));

export const REQUEST_URGENCY_VALUES = ["low", "standard", "high", "urgent"] as const;
export type RequestUrgency = (typeof REQUEST_URGENCY_VALUES)[number];

export const REQUEST_STATUS_VALUES = [
  "new",
  "under_review",
  "approved",
  "assigned",
  "in_progress",
  "completed",
  "archived",
  "rejected",
] as const;
export type RequestStatus = (typeof REQUEST_STATUS_VALUES)[number];

// The kanban shows six columns; the rest live behind a "show archived/rejected" filter.
export const REQUEST_KANBAN_STATUS_VALUES: RequestStatus[] = [
  "new",
  "under_review",
  "approved",
  "assigned",
  "in_progress",
  "completed",
];

export const REQUEST_SUBMITTED_VIA_VALUES = ["app", "public_form"] as const;
export type RequestSubmittedVia = (typeof REQUEST_SUBMITTED_VIA_VALUES)[number];

// ── education_requests (internal app insert) ────────────────────────────────

export const requestInsertSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  requested_by_name: z.string().min(1, "Requester name is required").max(200),
  requested_by_email: z
    .string()
    .nullish()
    .transform((v) => (v === "" || v == null ? null : v))
    .pipe(z.string().email("Must be a valid email address").nullable()),
  requested_by_department: emptyToNull,
  business_justification: emptyToNull,
  target_audience: emptyToNull,
  urgency: z.enum(REQUEST_URGENCY_VALUES).default("standard"),
  target_completion_date: emptyToNull,
});

export const requestUpdateSchema = requestInsertSchema.partial().extend({
  review_notes: emptyToNull.optional(),
  linked_tra_id: z
    .union([z.string().uuid(), z.literal(""), z.null()])
    .nullish()
    .transform((v) => (v === "" || v == null ? null : v))
    .optional(),
  linked_project_id: z
    .union([z.string().uuid(), z.literal(""), z.null()])
    .nullish()
    .transform((v) => (v === "" || v == null ? null : v))
    .optional(),
});

export type RequestInput = z.infer<typeof requestInsertSchema>;
export type RequestUpdate = z.infer<typeof requestUpdateSchema>;

export type EducationRequest = {
  id: string;
  org_id: string;
  title: string;
  requested_by_name: string;
  requested_by_email: string | null;
  requested_by_department: string | null;
  business_justification: string | null;
  target_audience: string | null;
  urgency: RequestUrgency;
  target_completion_date: string | null;
  status: RequestStatus;
  review_notes: string | null;
  linked_tra_id: string | null;
  linked_project_id: string | null;
  submitted_via: RequestSubmittedVia;
  public_form_token: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

// ── public form (anonymous) ─────────────────────────────────────────────────
// Same shape as requestInsertSchema but with the requester fields required —
// public submitters MUST identify themselves.

export const publicSubmitSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  requested_by_name: z.string().min(1, "Your name is required").max(200),
  requested_by_email: z
    .string()
    .min(1, "Your email is required")
    .email("Must be a valid email address"),
  requested_by_department: emptyToNull,
  business_justification: emptyToNull,
  target_audience: emptyToNull,
  urgency: z.enum(REQUEST_URGENCY_VALUES).default("standard"),
  target_completion_date: emptyToNull,
});

export type PublicSubmitInput = z.infer<typeof publicSubmitSchema>;

// ── status update ───────────────────────────────────────────────────────────

export const requestStatusUpdateSchema = z.object({
  status: z.enum(REQUEST_STATUS_VALUES),
  review_notes: emptyToNull.optional(),
});

export type RequestStatusUpdate = z.infer<typeof requestStatusUpdateSchema>;

// ── education_request_assignments ───────────────────────────────────────────

export const requestAssignmentSchema = z.object({
  instructor_id: z.string().uuid(),
  estimated_hours: z.coerce.number().min(0),
});

export const requestAssignmentUpdateSchema = z.object({
  estimated_hours: z.coerce.number().min(0).optional(),
  actual_hours: z.coerce.number().min(0).nullish().optional(),
});

export type RequestAssignmentInput = z.infer<typeof requestAssignmentSchema>;
export type RequestAssignmentUpdate = z.infer<typeof requestAssignmentUpdateSchema>;

export type EducationRequestAssignment = {
  id: string;
  org_id: string;
  request_id: string;
  instructor_id: string;
  estimated_hours: number;
  actual_hours: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

// ── education_request_history ───────────────────────────────────────────────

export type EducationRequestHistoryEntry = {
  id: number;
  org_id: string;
  request_id: string;
  from_status: string | null;
  to_status: RequestStatus;
  comment: string | null;
  actor_id: string | null;
  occurred_at: string;
};

// ── public_intake_links ─────────────────────────────────────────────────────

export const intakeLinkInsertSchema = z.object({
  label: emptyToNull,
  expires_at: emptyToNull,
});

export type IntakeLinkInput = z.infer<typeof intakeLinkInsertSchema>;

export type PublicIntakeLink = {
  id: string;
  org_id: string;
  token: string;
  label: string | null;
  is_active: boolean;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
};

export function publicIntakeUrl(origin: string, token: string): string {
  // Trim trailing slash off origin if present.
  return `${origin.replace(/\/$/, "")}/public/request/${token}`;
}
