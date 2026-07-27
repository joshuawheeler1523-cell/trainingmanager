"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgencyId, isAgencyAdmin } from "@/lib/auth/agency";
import { writeAuditDenial } from "@/lib/auth/audit-denial";
import type { Json, TablesUpdate } from "@/lib/supabase/database.types";
import type { ActionResult } from "@arbor/shared";

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

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const updateBrandingSchema = z.object({
  primaryColor: z
    .string()
    .regex(HEX_COLOR, "Use a #rrggbb hex color")
    .nullish()
    .transform((v) => (v === "" || v == null ? null : v)),
  secondaryColor: z
    .string()
    .regex(HEX_COLOR, "Use a #rrggbb hex color")
    .nullish()
    .transform((v) => (v === "" || v == null ? null : v)),
  accentColor: z
    .string()
    .regex(HEX_COLOR, "Use a #rrggbb hex color")
    .nullish()
    .transform((v) => (v === "" || v == null ? null : v)),
  emailFromName: z
    .string()
    .max(120)
    .nullish()
    .transform((v) => (v === "" || v == null ? null : v)),
  emailFromAddress: z
    .string()
    .email("Invalid email address")
    .nullish()
    .transform((v) => (v === "" || v == null ? null : v)),
});

/**
 * Update the calling agency's brand colors + email from-address.
 * Logo upload is a separate flow (uploadAgencyLogoAction below) because it
 * involves a file blob.
 *
 * @requiredAgencyRole agency_admin
 */
export async function updateAgencyBrandingAction(input: unknown): Promise<ActionResult<true>> {
  const parsed = updateBrandingSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const agencyId = await getCurrentAgencyId();
  if (!agencyId) {
    return { ok: false, error: { code: "NO_AGENCY", message: "Not a member of any agency" } };
  }
  if (!(await isAgencyAdmin(agencyId))) {
    await writeAuditDenial(agencyId, "agency_branding", "updateAgencyBranding", "not_agency_admin");
    return { ok: false, error: { code: "FORBIDDEN", message: "Agency admin only" } };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("agencies")
    .update({
      primary_color: parsed.data.primaryColor,
      secondary_color: parsed.data.secondaryColor,
      accent_color: parsed.data.accentColor,
      email_from_name: parsed.data.emailFromName,
      email_from_address: parsed.data.emailFromAddress,
    })
    .eq("id", agencyId);
  if (error) {
    return { ok: false, error: { code: error.code, message: error.message } };
  }

  await writeAgencyAuditLog(admin, {
    agencyId,
    operation: "AGENCY_BRANDING_UPDATED",
    recordId: agencyId,
    newValues: parsed.data,
  });

  revalidatePath("/agency/branding");
  revalidatePath("/agency");
  return { ok: true, data: true };
}

/**
 * Sets the agency's logo_url after the client uploaded it to the
 * `agency-branding` Storage bucket. The client uploads with the user's auth
 * token (Storage RLS gates writes to agency_admin of the matching folder),
 * then calls this action with the resulting public URL.
 *
 * Why split? File uploads via FormData through server actions add complexity
 * (request size limits, multipart parsing) that we get for free if the
 * browser uploads directly to Storage. The action just records the URL.
 *
 * @requiredAgencyRole agency_admin
 */
const setLogoSchema = z.object({
  logoUrl: z
    .string()
    .url("Invalid URL")
    .nullish()
    .transform((v) => (v === "" || v == null ? null : v)),
  faviconUrl: z
    .string()
    .url("Invalid URL")
    .nullish()
    .transform((v) => (v === "" || v == null ? null : v)),
});

export async function setAgencyLogoAction(input: unknown): Promise<ActionResult<true>> {
  const parsed = setLogoSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const agencyId = await getCurrentAgencyId();
  if (!agencyId) {
    return { ok: false, error: { code: "NO_AGENCY", message: "Not a member of any agency" } };
  }
  if (!(await isAgencyAdmin(agencyId))) {
    await writeAuditDenial(agencyId, "agency_branding", "setAgencyLogo", "not_agency_admin");
    return { ok: false, error: { code: "FORBIDDEN", message: "Agency admin only" } };
  }

  const admin = createAdminClient();
  const patch: TablesUpdate<"agencies"> = {
    logo_url: parsed.data.logoUrl,
    favicon_url: parsed.data.faviconUrl,
  };
  const { error } = await admin.from("agencies").update(patch).eq("id", agencyId);
  if (error) {
    return { ok: false, error: { code: error.code, message: error.message } };
  }

  await writeAgencyAuditLog(admin, {
    agencyId,
    operation: "AGENCY_LOGO_UPDATED",
    recordId: agencyId,
    newValues: parsed.data,
  });

  revalidatePath("/agency/branding");
  revalidatePath("/agency");
  return { ok: true, data: true };
}

/**
 * audit_log.org_id is NOT NULL, but agency-level events aren't tied to a
 * single org. Convention (matches Phase 5 billing): attribute to any one
 * org under the agency. If the agency has no client orgs yet (e.g. a
 * brand-new agency configuring its branding first), skip the audit row.
 */
async function writeAgencyAuditLog(
  admin: ReturnType<typeof createAdminClient>,
  args: {
    agencyId: string;
    operation: string;
    recordId: string;
    newValues: Record<string, unknown>;
  },
): Promise<void> {
  const { data: anyOrg } = await admin
    .from("organizations")
    .select("id")
    .eq("agency_id", args.agencyId)
    .limit(1)
    .maybeSingle();
  if (!anyOrg) return;

  const { data: userData } = await (await createClient()).auth.getUser();
  await admin.from("audit_log").insert({
    org_id: anyOrg.id,
    actor_id: userData.user?.id ?? null,
    operation: args.operation,
    table_name: "agencies",
    record_id: args.recordId,
    changed_fields: null,
    old_values: null,
    new_values: args.newValues as Json,
  });
}
