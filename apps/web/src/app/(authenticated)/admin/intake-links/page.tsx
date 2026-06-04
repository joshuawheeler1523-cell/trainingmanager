import { notFound } from "next/navigation";
import PageHeader from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { isManager } from "@/lib/auth/role";
import IntakeLinksView from "./intake-links-view";
import type { PublicIntakeLink } from "@arbor/shared";
import { getPublicBaseUrl } from "@/lib/public-url";

export default async function IntakeLinksPage() {
  const [supabase, orgId, origin] = await Promise.all([
    createClient(),
    getCurrentOrgId(),
    getPublicBaseUrl(),
  ]);
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
