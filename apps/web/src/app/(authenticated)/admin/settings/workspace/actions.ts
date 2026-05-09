"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  PRESETS,
  TOGGLEABLE_MODULES,
  type LabelOverrides,
  type PresetKey,
  type ToggleableModule,
} from "@arbor/shared";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { isManager } from "@/lib/auth/role";
import type { Json } from "@/lib/supabase/database.types";

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

async function ctx() {
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) {
    return { ok: false as const, error: { code: "NO_ORG", message: "No active organization" } };
  }
  if (!(await isManager(orgId))) {
    return { ok: false as const, error: { code: "FORBIDDEN", message: "Manager only" } };
  }
  return { ok: true as const, supabase, orgId };
}

function revalidateWorkspace() {
  revalidatePath("/admin/settings/workspace");
  // The label provider lives in the authenticated layout, so any change to
  // labels or modules should refresh the entire shell.
  revalidatePath("/", "layout");
}

// ── Apply preset ────────────────────────────────────────────────────────────

const PRESET_KEY_VALUES: [PresetKey, ...PresetKey[]] = [
  "hospital_training",
  "corporate_ld",
  "emr_analyst",
  "clinical_informatics",
  "software_engineering",
  "consulting",
  "creative_agency",
  "custom",
];

const applyPresetSchema = z.object({
  presetKey: z.enum(PRESET_KEY_VALUES),
  overwriteLabels: z.boolean().default(false),
});

/**
 * Switches the org to a different workspace preset. Optionally overwrites
 * existing label overrides with the preset's defaults. Always reseeds the
 * module feature flags from the preset's manifest.
 *
 * Destructive: existing module flags are replaced. Existing labels are kept
 * unless overwriteLabels=true. The destructive nature is gated by the UI
 * confirm dialog before this action is invoked.
 *
 * @requiredRole manager
 */
export async function applyWorkspacePresetAction(
  input: unknown,
): Promise<ActionResult<{ presetKey: PresetKey }>> {
  const parsed = applyPresetSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const preset = PRESETS[parsed.data.presetKey];

  const { error } = await c.supabase.rpc("apply_workspace_preset", {
    p_org_id: c.orgId,
    p_preset_key: parsed.data.presetKey,
    p_module_flags: preset.modules as unknown as Json,
    p_role_labels: preset.roleLabels as unknown as Json,
    p_entity_labels: preset.entityLabels as unknown as Json,
    p_overwrite_labels: parsed.data.overwriteLabels,
  });
  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  revalidateWorkspace();
  return { ok: true, data: { presetKey: parsed.data.presetKey } };
}

// ── Update label overrides ──────────────────────────────────────────────────

const labelValueSchema = z.object({
  singular: z
    .string()
    .nullish()
    .transform((v) => (v === "" || v == null ? undefined : v)),
  plural: z
    .string()
    .nullish()
    .transform((v) => (v === "" || v == null ? undefined : v)),
});

// Per-org overrides only allow singular/plural for the four canonical kinds.
const labelOverridesSchema = z
  .object({
    "role.manager": labelValueSchema.optional(),
    "role.instructor": labelValueSchema.optional(),
    "role.viewer": labelValueSchema.optional(),
    "entity.instructor": labelValueSchema.optional(),
  })
  .strict();

const updateLabelOverridesSchema = z.object({
  roleLabels: labelOverridesSchema.default({}),
  entityLabels: labelOverridesSchema.default({}),
});

/**
 * Updates the org's label overrides. Pass empty objects to clear (back to
 * canonical defaults). Singular/plural can be omitted independently — empty
 * strings clear that specific field.
 *
 * @requiredRole manager
 */
export async function updateLabelOverridesAction(
  input: unknown,
): Promise<ActionResult<{ updated: true }>> {
  const parsed = updateLabelOverridesSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  // Strip undefined fields from each label entry so we don't write
  // {"singular":undefined} into jsonb.
  type ParsedEntry = { singular?: string | undefined; plural?: string | undefined } | undefined;
  function clean(overrides: Record<string, ParsedEntry>): LabelOverrides {
    const out: LabelOverrides = {};
    for (const [k, v] of Object.entries(overrides)) {
      if (!v) continue;
      const inner: { singular?: string; plural?: string } = {};
      if (v.singular !== undefined) inner.singular = v.singular;
      if (v.plural !== undefined) inner.plural = v.plural;
      if (Object.keys(inner).length > 0) {
        out[k as keyof LabelOverrides] = inner;
      }
    }
    return out;
  }

  const { error } = await c.supabase
    .from("organizations")
    .update({
      role_labels: clean(parsed.data.roleLabels),
      entity_labels: clean(parsed.data.entityLabels),
    })
    .eq("id", c.orgId);
  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  revalidateWorkspace();
  return { ok: true, data: { updated: true } };
}

// ── Toggle a single module flag ─────────────────────────────────────────────

const moduleToggleSchema = z.object({
  moduleKey: z.enum(TOGGLEABLE_MODULES as [ToggleableModule, ...ToggleableModule[]]),
  enabled: z.boolean(),
});

/**
 * Toggle a single module on/off. Used by the workspace settings page when a
 * manager wants to override a single module without re-applying a whole preset.
 *
 * @requiredRole manager
 */
export async function setModuleFlagAction(
  input: unknown,
): Promise<ActionResult<{ moduleKey: ToggleableModule; enabled: boolean }>> {
  const parsed = moduleToggleSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { error } = await c.supabase.from("feature_flags").upsert(
    {
      org_id: c.orgId,
      key: parsed.data.moduleKey,
      enabled: parsed.data.enabled,
    },
    { onConflict: "org_id,key" },
  );
  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  revalidateWorkspace();
  return { ok: true, data: { moduleKey: parsed.data.moduleKey, enabled: parsed.data.enabled } };
}
