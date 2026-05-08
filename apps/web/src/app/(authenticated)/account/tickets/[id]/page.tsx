import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/20/solid";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { isOrgAdmin } from "@/lib/auth/org-admin";
import TicketThread from "./ticket-thread";

type Params = Promise<{ id: string }>;

export default async function TicketDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) notFound();

  const [{ data: ticket }, { data: messages }, admin] = await Promise.all([
    supabase.from("support_tickets").select("*").eq("id", id).maybeSingle(),
    supabase.from("support_ticket_messages").select("*").eq("ticket_id", id).order("created_at"),
    isOrgAdmin(orgId),
  ]);

  if (!ticket) notFound();

  return (
    <div>
      <div className="border-border bg-background border-b px-6 py-4">
        <Link
          href="/account/tickets"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" />
          All tickets
        </Link>
        <h1 className="text-foreground mt-1 text-xl font-semibold">{ticket.subject}</h1>
      </div>
      <div className="p-6">
        <TicketThread
          ticket={ticket}
          messages={messages ?? []}
          viewerSide={admin ? "admin" : "user"}
        />
      </div>
    </div>
  );
}
