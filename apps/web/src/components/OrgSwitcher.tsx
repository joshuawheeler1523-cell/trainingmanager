import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import OrgSwitcherClient from "./org-switcher-client";

export default async function OrgSwitcher() {
  const [supabase, currentOrgId] = await Promise.all([createClient(), getCurrentOrgId()]);

  if (!currentOrgId) return null;

  const { data: memberships } = await supabase
    .from("org_memberships")
    .select("org_id")
    .not("accepted_at", "is", null);

  if (!memberships?.length) return null;

  const orgIds = memberships.map((m) => m.org_id);
  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, name")
    .in("id", orgIds)
    .order("name");

  if (!orgs?.length) return null;

  return <OrgSwitcherClient orgs={orgs} currentOrgId={currentOrgId} />;
}
