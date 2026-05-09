import { notFound } from "next/navigation";
import PageHeader from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { isManager } from "@/lib/auth/role";
import IntakeLinksView from "./intake-links-view";
import type { PublicIntakeLink } from "@arbor/shared";
import { headers } from "next/headers";

export default async function IntakeLinksPage() {
  const [supabase, orgId, hdrs] = await Promise.all([createClient(), getCurrentOrgId(), headers()]);
  if (!orgId) notFound();

  const isAdmin = await isManager(orgId);
  if (!isAdmin) {
    return (
      <div>
        <PageHeader
          title="Intake links"
          description="Tokenized public intake forms for stakeholder requests."
        />
        <div className="text-muted-foreground p-6 text-sm">
          Manager access required to manage intake links.
        </div>
      </div>
    );
  }

  const { data } = await supabase
    .from("public_intake_links")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  const links = (data ?? []) as PublicIntakeLink[];

  // Compute the public origin so the view can render copy-able URLs without
  // the client needing to figure out the host. Fall back to localhost for
  // dev where x-forwarded-host isn't set.
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "localhost:3000";
  const proto = hdrs.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  return (
    <div>
      <PageHeader
        title="Intake links"
        description="Tokenized public URLs that let stakeholders submit training requests without logging in."
      />
      <IntakeLinksView links={links} origin={origin} />
    </div>
  );
}
