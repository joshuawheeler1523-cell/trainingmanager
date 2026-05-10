import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgencyId } from "@/lib/auth/agency";

export type Brand = {
  // Display
  name: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  // Colors (hex #rrggbb)
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  // Email
  emailFromName: string;
  emailFromAddress: string;
  // Provenance — useful for debug + cache key + telling whether we're using
  // the agency's brand or Arbor defaults.
  source: "agency" | "default";
  agencyId: string | null;
};

const ARBOR_DEFAULTS = {
  name: "Arbor",
  logoUrl: null,
  faviconUrl: null,
  primaryColor: "#2563eb",
  secondaryColor: "#64748b",
  accentColor: "#10b981",
  emailFromName: "Arbor",
  emailFromAddress: "onboarding@resend.dev",
} as const;

/**
 * Returns the active brand for the current request.
 *
 *   - If the caller is in an agency context (via getCurrentAgencyId), pulls
 *     that agency's branding row and overlays each set field on top of the
 *     Arbor defaults. NULL fields fall through to defaults so an agency that
 *     hasn't customized anything still gets a coherent brand.
 *   - Otherwise returns the Arbor defaults.
 *
 * Cached per-request via React.cache so layout + page + email helper share
 * one query.
 */
export const getCurrentBrand = cache(async (): Promise<Brand> => {
  const agencyId = await getCurrentAgencyId();
  if (!agencyId) return { ...ARBOR_DEFAULTS, source: "default", agencyId: null };
  return getBrandForAgency(agencyId);
});

/**
 * Brand for a specific organization. Looks up the org's parent agency (if
 * any) and returns its brand. Standalone orgs (no agency_id) get the Arbor
 * defaults. Used by org-context flows like sending invitation emails where
 * the brand must reflect the org's parent agency, not the inviter's own
 * agency_membership.
 */
export async function getBrandForOrg(orgId: string): Promise<Brand> {
  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("agency_id")
    .eq("id", orgId)
    .maybeSingle();
  if (!org?.agency_id) return { ...ARBOR_DEFAULTS, source: "default", agencyId: null };
  return getBrandForAgency(org.agency_id);
}

/**
 * Brand for a specific agency id (used by background jobs / PDF generation
 * routes that aren't operating in a request-bound agency context).
 */
export async function getBrandForAgency(agencyId: string): Promise<Brand> {
  const supabase = await createClient();
  const { data: agency } = await supabase
    .from("agencies")
    .select(
      "name, logo_url, favicon_url, primary_color, secondary_color, accent_color, email_from_name, email_from_address",
    )
    .eq("id", agencyId)
    .maybeSingle();

  if (!agency) return { ...ARBOR_DEFAULTS, source: "default", agencyId: null };

  return {
    name: agency.name,
    logoUrl: agency.logo_url,
    faviconUrl: agency.favicon_url,
    primaryColor: agency.primary_color ?? ARBOR_DEFAULTS.primaryColor,
    secondaryColor: agency.secondary_color ?? ARBOR_DEFAULTS.secondaryColor,
    accentColor: agency.accent_color ?? ARBOR_DEFAULTS.accentColor,
    emailFromName: agency.email_from_name ?? agency.name,
    emailFromAddress: agency.email_from_address ?? ARBOR_DEFAULTS.emailFromAddress,
    source: "agency",
    agencyId,
  };
}

/**
 * Renders the brand's color triplet as inline CSS custom properties for
 * injection into <html style={...}> or <body style={...}>.
 */
export function brandCssVars(brand: Brand): React.CSSProperties {
  return {
    ["--brand-primary" as string]: brand.primaryColor,
    ["--brand-secondary" as string]: brand.secondaryColor,
    ["--brand-accent" as string]: brand.accentColor,
  };
}

/**
 * Formats the brand's from address per RFC 5322:
 *   "Mercy Health Training" <invitations@mercy-health.com>
 */
export function brandFromHeader(brand: Brand): string {
  return `${brand.emailFromName} <${brand.emailFromAddress}>`;
}
