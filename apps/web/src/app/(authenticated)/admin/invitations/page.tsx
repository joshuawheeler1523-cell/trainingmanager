import { headers } from "next/headers";
import PageHeader from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import InvitationsView, { type InvitationRow } from "./invitations-view";

export default async function InvitationsPage() {
  const [supabase, orgId, hdrs] = await Promise.all([createClient(), getCurrentOrgId(), headers()]);
  if (!orgId) {
    return (
      <div>
        <PageHeader title="Invitations" description="Pending invitations." />
        <div className="text-muted-foreground p-6 text-sm">No active organization.</div>
      </div>
    );
  }

  const { data } = await supabase
    .from("org_invitations")
    .select("id, email, role, visibility, token, expires_at, accepted_at, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "localhost:3000";
  const origin = `${proto}://${host}`;

  const rows: InvitationRow[] = (data ?? []).map((i) => ({
    id: i.id,
    email: i.email,
    role: i.role as InvitationRow["role"],
    visibility: i.visibility as InvitationRow["visibility"],
    token: i.token,
    accept_url: `${origin}/accept-invite/${i.token}`,
    expires_at: i.expires_at,
    accepted_at: i.accepted_at,
    created_at: i.created_at,
  }));

  return (
    <div>
      <PageHeader
        title="Invitations"
        description="Pending invitations. Re-send to extend the expiry, or revoke to invalidate the link."
      />
      <div className="p-6">
        <InvitationsView invitations={rows} />
      </div>
    </div>
  );
}
