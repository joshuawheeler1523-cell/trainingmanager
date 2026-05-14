import Link from "next/link";
import { notFound } from "next/navigation";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { createAdminClient } from "@/lib/supabase/admin";
import OrgSettingsControls from "./org-settings-controls";

export const metadata = { title: "Organization" };

export default async function ArborOrgDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminClient();

  const [
    { data: org },
    { data: agencies },
    { data: memberships },
    { data: instructorsCount },
    { data: trasCount },
    { data: projectsCount },
    { data: classesCount },
    { data: recentAudit },
    { data: dataExportsCount },
  ] = await Promise.all([
    admin.from("organizations").select("*").eq("id", id).maybeSingle(),
    admin.from("agencies").select("id, name").order("name"),
    admin.from("org_memberships").select("user_id, role, accepted_at, invited_at").eq("org_id", id),
    admin
      .from("instructors")
      .select("id", { count: "exact", head: true })
      .eq("org_id", id)
      .eq("is_external", false)
      .is("deleted_at", null),
    admin.from("tras").select("id", { count: "exact", head: true }).eq("org_id", id),
    admin
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("org_id", id)
      .is("deleted_at", null),
    admin
      .from("classes")
      .select("id", { count: "exact", head: true })
      .eq("org_id", id)
      .is("deleted_at", null),
    admin
      .from("audit_log")
      .select("id, occurred_at, operation, table_name, actor_id, record_id")
      .eq("org_id", id)
      .order("occurred_at", { ascending: false })
      .limit(20),
    admin.from("data_exports").select("id", { count: "exact", head: true }).eq("org_id", id),
  ]);

  if (!org) notFound();

  // Resolve member emails
  const memberUserIds = new Set((memberships ?? []).map((m) => m.user_id));
  const { data: usersResp } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const userMap = new Map(
    usersResp.users.filter((u) => memberUserIds.has(u.id)).map((u) => [u.id, u]),
  );

  // Resolve actor emails for the audit feed
  const actorIds = Array.from(
    new Set((recentAudit ?? []).map((a) => a.actor_id).filter((x): x is string => !!x)),
  );
  const actorMap = new Map(
    usersResp.users.filter((u) => actorIds.includes(u.id)).map((u) => [u.id, u.email ?? null]),
  );

  return (
    <div className="space-y-6 p-6">
      <header>
        <Link href="/arbor/orgs" className="text-muted-foreground hover:text-foreground text-xs">
          ← All organizations
        </Link>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-foreground text-2xl font-bold">{org.name}</h1>
            <p className="text-muted-foreground mt-1 font-mono text-xs">{org.slug}</p>
            {org.agency_id && (
              <p className="text-muted-foreground mt-1 text-xs">
                Under agency:{" "}
                <Link
                  href={`/arbor/agencies/${org.agency_id}`}
                  className="text-primary hover:underline"
                >
                  {(agencies ?? []).find((a) => a.id === org.agency_id)?.name ?? "Unknown"}
                </Link>
              </p>
            )}
          </div>
          <div className="text-right">
            {org.suspended_at ? (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-800 dark:bg-rose-900/20 dark:text-rose-300">
                <ExclamationTriangleIcon className="h-3.5 w-3.5" />
                Suspended
              </span>
            ) : (
              <span className="inline-block rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
                Active
              </span>
            )}
          </div>
        </div>
      </header>

      {org.suspended_at && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 dark:bg-rose-900/20">
          <p className="text-sm font-semibold text-rose-900 dark:text-rose-200">
            This organization is suspended.
          </p>
          <p className="mt-1 text-xs text-rose-800 dark:text-rose-300/90">
            Since {org.suspended_at.slice(0, 10)}.{" "}
            {org.suspended_reason ? `Reason: ${org.suspended_reason}` : ""}
          </p>
        </div>
      )}

      {/* Stats */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Members" value={(memberships ?? []).length.toString()} />
        <StatTile
          label="Instructors"
          value={
            (instructorsCount as unknown as { count?: number } | null)?.count?.toString() ?? "0"
          }
        />
        <StatTile
          label="Work intake"
          value={(trasCount as unknown as { count?: number } | null)?.count?.toString() ?? "0"}
        />
        <StatTile
          label="Projects"
          value={(projectsCount as unknown as { count?: number } | null)?.count?.toString() ?? "0"}
        />
        <StatTile
          label="Classes"
          value={(classesCount as unknown as { count?: number } | null)?.count?.toString() ?? "0"}
        />
        <StatTile
          label="Data exports"
          value={
            (dataExportsCount as unknown as { count?: number } | null)?.count?.toString() ?? "0"
          }
        />
      </section>

      {/* Members */}
      <section className="border-border bg-background overflow-hidden rounded-xl border">
        <div className="border-border border-b px-5 py-3">
          <h2 className="text-foreground text-base font-bold">
            Members ({(memberships ?? []).length.toString()})
          </h2>
        </div>
        {(memberships ?? []).length === 0 ? (
          <p className="text-muted-foreground p-6 text-center text-sm italic">No members yet.</p>
        ) : (
          <ul className="divide-border divide-y text-sm">
            {(memberships ?? []).map((m) => {
              const user = userMap.get(m.user_id);
              return (
                <li key={m.user_id} className="flex items-center justify-between px-5 py-2.5">
                  <div>
                    <Link
                      href={`/arbor/users/${m.user_id}`}
                      className="text-foreground hover:text-primary font-medium"
                    >
                      {user?.email ?? m.user_id.slice(0, 8)}
                    </Link>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {(user?.user_metadata.full_name as string | undefined) ?? "—"} ·{" "}
                      {m.accepted_at ? `accepted ${m.accepted_at.slice(0, 10)}` : "pending"}
                    </p>
                  </div>
                  <span className="text-muted-foreground text-xs capitalize">{m.role}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Recent audit */}
      <section className="border-border bg-background overflow-hidden rounded-xl border">
        <div className="border-border border-b px-5 py-3">
          <h2 className="text-foreground text-base font-bold">Recent activity</h2>
        </div>
        {(recentAudit ?? []).length === 0 ? (
          <p className="text-muted-foreground p-6 text-center text-sm italic">No activity.</p>
        ) : (
          <ul className="divide-border divide-y text-sm">
            {(recentAudit ?? []).map((e) => (
              <li key={e.id} className="px-5 py-2">
                <p className="text-foreground font-mono text-xs">{e.operation}</p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {e.table_name} · {e.actor_id ? (actorMap.get(e.actor_id) ?? "user") : "system"} ·{" "}
                  {e.occurred_at.replace("T", " ").slice(0, 16)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Settings */}
      <OrgSettingsControls
        orgId={org.id}
        orgName={org.name}
        currentAgencyId={org.agency_id}
        agencies={(agencies ?? []).map((a) => ({ id: a.id, name: a.name }))}
        isSuspended={!!org.suspended_at}
      />
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border bg-background rounded-xl border p-4">
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <p className="text-foreground mt-2 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
