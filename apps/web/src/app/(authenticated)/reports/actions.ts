"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import {
  REPORT_SLUGS,
  savedReportInsertSchema,
  savedReportUpdateSchema,
  type ReportSlug,
  type SavedReport,
} from "@arbor/shared";
import type { Json, TablesUpdate } from "@/lib/supabase/database.types";

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; field?: string } };

function validationError(err: {
  errors: Array<{ message: string; path: (string | number)[] }>;
}): ActionResult<never> {
  const first = err.errors[0];
  const field = first?.path.join(".");
  return {
    ok: false,
    error: {
      code: "VALIDATION",
      message: first?.message ?? "Invalid input",
      ...(field ? { field } : {}),
    },
  };
}

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

async function ctx() {
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) {
    return { ok: false as const, error: { code: "NO_ORG", message: "No active organization" } };
  }
  return { ok: true as const, supabase, orgId };
}

// ── saved reports ──────────────────────────────────────────────────────────

export async function saveReport(input: unknown): Promise<ActionResult<SavedReport>> {
  const parsed = savedReportInsertSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("saved_reports")
    .insert({
      ...parsed.data,
      org_id: c.orgId,
      filters: parsed.data.filters as unknown as Json,
    })
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath("/reports/saved");
  return { ok: true, data: data as unknown as SavedReport };
}

export async function updateSavedReport(
  id: string,
  input: unknown,
): Promise<ActionResult<SavedReport>> {
  const parsed = savedReportUpdateSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("saved_reports")
    .update(
      stripUndefined(
        parsed.data as Record<string, unknown>,
      ) as unknown as TablesUpdate<"saved_reports">,
    )
    .eq("id", id)
    .eq("org_id", c.orgId)
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath("/reports/saved");
  return { ok: true, data: data as unknown as SavedReport };
}

export async function deleteSavedReport(id: string): Promise<ActionResult<{ id: string }>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { error } = await c.supabase
    .from("saved_reports")
    .delete()
    .eq("id", id)
    .eq("org_id", c.orgId);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath("/reports/saved");
  return { ok: true, data: { id } };
}

// ── run history ────────────────────────────────────────────────────────────

// Records a run in report_runs. Called by the export route after a successful
// generation. Slug is validated against the registry to keep the column
// constrained to known reports.
export async function recordReportRun(args: {
  slug: string;
  filters: Record<string, unknown>;
  format: "pdf" | "xlsx" | "csv" | "preview";
  rowCount: number | null;
  durationMs: number | null;
  savedReportId?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  if (!REPORT_SLUGS.includes(args.slug as ReportSlug)) {
    return { ok: false, error: { code: "VALIDATION", message: `Unknown report ${args.slug}` } };
  }
  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("report_runs")
    .insert({
      org_id: c.orgId,
      slug: args.slug,
      saved_report_id: args.savedReportId ?? null,
      filters: args.filters as unknown as Json,
      format: args.format,
      row_count: args.rowCount,
      duration_ms: args.durationMs,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  return { ok: true, data: { id: data.id } };
}
