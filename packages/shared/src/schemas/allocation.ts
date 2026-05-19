import { z } from "zod";

const emptyToNull = z
  .string()
  .nullish()
  .transform((v) => (v === "" || v == null ? null : v));

// Arbor palette swatches for the bucket color picker — same tokens used
// by allocation templates so user-created buckets match the editorial
// theme. Existing buckets with off-palette hex values stay valid
// (column validation accepts any #RRGGBB).
export const BUCKET_COLORS = [
  "#1F4D3A", // forest — direct training / delivery
  "#8FA68E", // sage — course development / content
  "#4A8A6B", // sage-teal — analytics / data / QA
  "#4D7C8E", // teal-blue — support / rounding
  "#4A6B8A", // blue — projects / implementation
  "#6B5B95", // muted purple — governance / committees
  "#C97B63", // warm clay — people / coaching
  "#B5651D", // terracotta — build / configuration
  "#D4A574", // amber — compliance / audit
  "#6B6B68", // gray — administrative / meetings
  "#9CA3AF", // light gray — PTO / non-productive
] as const;

export const ALLOCATION_SOURCE_VALUES = ["individual", "group", "global", "none"] as const;
export type AllocationSource = (typeof ALLOCATION_SOURCE_VALUES)[number];

// ── allocation_buckets ──────────────────────────────────────────────────────

export const bucketInsertSchema = z.object({
  name: z.string().min(1, "Name is required").max(80),
  description: emptyToNull,
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a #RRGGBB hex value")
    .default("#1F4D3A"),
  display_order: z.coerce.number().int().min(0).default(0),
  is_archived: z.boolean().default(false),
});

export const bucketUpdateSchema = bucketInsertSchema.partial();

export type BucketInput = z.infer<typeof bucketInsertSchema>;
export type BucketUpdate = z.infer<typeof bucketUpdateSchema>;

export type AllocationBucket = {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  color: string;
  display_order: number;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

// Re-order payload: list of {id, display_order} pairs.
export const bucketReorderSchema = z.array(
  z.object({
    id: z.string().uuid(),
    display_order: z.coerce.number().int().min(0),
  }),
);

// ── global_allocations / group_allocations / individual_allocations ─────────

const targetPercentSchema = z.coerce.number().min(0).max(100);

// Save a full slate of percentages for one scope (global / group / individual).
// Each entry is (bucket_id, target_percent). Server replaces the existing rows.
export const allocationSlateSchema = z.array(
  z.object({
    bucket_id: z.string().uuid(),
    target_percent: targetPercentSchema,
  }),
);
export type AllocationSlate = z.infer<typeof allocationSlateSchema>;

export type GlobalAllocation = {
  id: string;
  org_id: string;
  bucket_id: string;
  target_percent: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type GroupAllocation = {
  id: string;
  org_id: string;
  group_id: string;
  bucket_id: string;
  target_percent: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type IndividualAllocation = {
  id: string;
  org_id: string;
  instructor_id: string;
  bucket_id: string;
  target_percent: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

// ── allocation_groups ───────────────────────────────────────────────────────

export const groupInsertSchema = z.object({
  name: z.string().min(1, "Name is required").max(80),
  description: emptyToNull,
});

export const groupUpdateSchema = groupInsertSchema.partial();

export type GroupInput = z.infer<typeof groupInsertSchema>;
export type GroupUpdate = z.infer<typeof groupUpdateSchema>;

export type AllocationGroup = {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type AllocationGroupMember = {
  group_id: string;
  instructor_id: string;
  org_id: string;
  created_at: string;
};

// ── effective_allocation result row ─────────────────────────────────────────

export type EffectiveAllocationRow = {
  bucket_id: string;
  target_percent: number;
  source: AllocationSource;
};

// Helper used by client UIs: given a slate, returns the sum (rounded to 2 dp)
// and whether it equals exactly 100.
export function sumSlate(slate: { target_percent: number }[]): {
  sum: number;
  isHundred: boolean;
} {
  const sum = Math.round(slate.reduce((acc, s) => acc + (s.target_percent || 0), 0) * 100) / 100;
  return { sum, isHundred: Math.abs(sum - 100) < 0.005 };
}
