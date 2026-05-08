import PageHeader from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { isOrgAdmin } from "@/lib/auth/org-admin";
import TicketsView, { type TicketRow } from "./tickets-view";

export default async function TicketsPage() {
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) {
    return (
      <div>
        <PageHeader title="My tickets" description="Support tickets." />
        <div className="text-muted-foreground p-6 text-sm">No active organization.</div>
      </div>
    );
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = await isOrgAdmin(orgId);

  // Admins see every ticket in their org; users see their own. The RLS
  // policy enforces this server-side; we just decide which copy to show.
  const { data: tickets } = await supabase
    .from("support_tickets")
    .select("*")
    .order("last_message_at", { ascending: false });

  const rows = (tickets ?? []) as TicketRow[];

  return (
    <div>
      <PageHeader
        title={admin ? "Support tickets (admin view)" : "My tickets"}
        description={
          admin
            ? "Every ticket from your org. The platform support team also sees these."
            : "Tickets you've opened. Reply to update them; admins or platform support will respond."
        }
      />
      <div className="p-6">
        <TicketsView tickets={rows} viewerSide={admin ? "admin" : "user"} />
      </div>
    </div>
  );
}
