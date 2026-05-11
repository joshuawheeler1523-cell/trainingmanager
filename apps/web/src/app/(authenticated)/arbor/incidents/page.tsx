import { createAdminClient } from "@/lib/supabase/admin";
import IncidentsManager from "./incidents-manager";

export const metadata = { title: "Status incidents" };

export default async function ArborIncidentsPage() {
  const admin = createAdminClient();
  const { data: incidents } = await admin
    .from("status_incidents")
    .select(
      "id, title, body, severity, status, started_at, resolved_at, status_incident_updates(id, status, body, created_at)",
    )
    .order("started_at", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-foreground text-2xl font-bold">Status incidents</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Manage what shows on the public /status page. Posting an incident here makes it visible to
          customers immediately.
        </p>
      </header>

      <IncidentsManager
        incidents={(incidents ?? []).map((i) => ({
          id: i.id,
          title: i.title,
          body: i.body,
          severity: i.severity,
          status: i.status,
          started_at: i.started_at,
          resolved_at: i.resolved_at,
          updates: i.status_incident_updates.map((u) => ({
            id: u.id,
            status: u.status,
            body: u.body,
            created_at: u.created_at,
          })),
        }))}
      />
    </div>
  );
}
