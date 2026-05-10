import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgencyId } from "@/lib/auth/agency";
import BrandingForm from "./branding-form";

export default async function AgencyBrandingPage() {
  const supabase = await createClient();
  const agencyId = await getCurrentAgencyId();
  if (!agencyId) return null;

  const { data: agency } = await supabase
    .from("agencies")
    .select(
      "id, name, logo_url, primary_color, secondary_color, accent_color, email_from_name, email_from_address",
    )
    .eq("id", agencyId)
    .maybeSingle();

  if (!agency) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <Link href="/agency" className="text-muted-foreground hover:text-foreground text-xs">
          ← Back to dashboard
        </Link>
        <h1 className="text-foreground mt-2 text-2xl font-bold">Branding</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Your logo, brand colors, and outbound email identity. These show up on the agency console,
          generated invoice PDFs, and (once a custom domain is configured) your client orgs&apos;
          login pages.
        </p>
      </div>

      <BrandingForm
        agencyId={agency.id}
        initial={{
          logoUrl: agency.logo_url,
          primaryColor: agency.primary_color ?? "",
          secondaryColor: agency.secondary_color ?? "",
          accentColor: agency.accent_color ?? "",
          emailFromName: agency.email_from_name ?? "",
          emailFromAddress: agency.email_from_address ?? "",
        }}
      />
    </div>
  );
}
