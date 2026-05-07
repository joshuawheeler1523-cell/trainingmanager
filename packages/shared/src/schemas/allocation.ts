import { z } from "zod";

const emptyToNull = z
  .string()
  .nullish()
  .transform((v) => (v === "" || v == null ? null : v));

// 12 predefined bucket colors. Picker shows these as swatches.
export const BUCKET_COLORS = [
  "#6366f1", // indigo
  "#3b82f6", // blue
  "#06b6d4", // cyan
  "#10b981", // emerald
  "#84cc16", // lime
  "#eab308", // yellow
  "#f59e0b", // amber
  "#f97316", // orange
  "#ef4444", // red
  "#ec4899", // pink
  "#a855f7", // purple
  "#64748b", // slate
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
    .default("#6366f1"),
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
