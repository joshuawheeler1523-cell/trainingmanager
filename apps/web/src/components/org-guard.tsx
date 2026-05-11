import { redirect } from "next/navigation";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { createClient } from "@/lib/supabase/server";
import SuspendedBanner from "./suspended-banner";

export default async function OrgGuard({ children }: { children: React.ReactNode }) {
  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/onboarding");

  // Suspension check — both org-level and parent-agency-level. Org-level
  // suspension blocks just this org. Agency-level suspension blocks every
  // org under the agency (treated as if the org itself were suspended).
  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("suspended_at, suspended_reason, agency_id, agencies(suspended_at, suspended_reason)")
    .eq("id", orgId)
    .maybeSingle();

  if (org?.suspended_at) {
    return <SuspendedBanner scope="org" reason={org.suspended_reason} />;
  }
  const ag = org?.agencies as {
    suspended_at: string | null;
    suspended_reason: string | null;
  } | null;
  if (ag?.suspended_at) {
    return <SuspendedBanner scope="agency" reason={ag.suspended_reason} />;
  }
  return <>{children}</>;
}
