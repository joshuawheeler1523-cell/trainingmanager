import Link from "next/link";
import { notFound } from "next/navigation";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { createAdminClient } from "@/lib/supabase/admin";
import UserActions from "./user-actions";

export const metadata = { title: "User" };

export default async function ArborUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminClient();

  const [
    { data: userResp, error },
    { data: orgMems },
    { data: agencyMems },
    { data: recentAudit },
  ] = await Promise.all([
    admin.auth.admin.getUserById(id),
    admin
      .from("org_memberships")
      .select("org_id, role, accepted_at, organizations(name, slug)")
      .eq("user_id", id),
    admin
      .from("agency_memberships")
      .select("agency_id, role, accepted_at, agencies(name, slug)")
      .eq("user_id", id),
    admin
      .from("audit_log")
      .select("id, occurred_at, operation, table_name, org_id, record_id")
      .eq("actor_id", id)
      .order("occurred_at", { ascending: false })
      .limit(30),
  ]);

  if (error) notFound();
  const user = userResp.user;

  const banned = (user as unknown as { banned_until?: string | null }).banned_until;
  const isBanned = typeof banned === "string" && new Date(banned).getTime() > Date.now();

  return (
    <div className="space-y-6 p-6">
      <header>
        <Link href="/arbor/users" className="text-muted-foreground hover:text-foreground text-xs">
          ← All users
        </Link>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-foreground text-2xl font-bold">{user.email ?? "(no email)"}</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {(user.user_metadata.full_name as string | undefined) ?? <em>no name</em>} ·{" "}
              <span className="font-mono text-xs">{user.id}</span>
            </p>
          </div>
          <div className="text-right">
            {isBanned ? (
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

      {/* Profile */}
      <section className="border-border bg-background grid grid-cols-1 gap-4 rounded-xl border p-5 sm:grid-cols-3">
        <Stat label="Created" value={user.created_at.slice(0, 16).replace("T", " ")} />
        <Stat
          label="Last sign-in"
          value={
            user.last_sign_in_at ? user.last_sign_in_at.slice(0, 16).replace("T", " ") : "never"
          }
        />
        <Stat
          label="Email confirmed"
          value={user.email_confirmed_at ? user.email_confirmed_at.slice(0, 10) : "no"}
        />
      </section>

      {/* Memberships */}
      <section className="border-border bg-background overflow-hidden rounded-xl border">
        <div className="border-border border-b px-5 py-3">
          <h2 className="text-foreground text-base font-bold">
            Memberships ({((orgMems ?? []).length + (agencyMems ?? []).length).toString()})
          </h2>
        </div>
        {(orgMems ?? []).length === 0 && (agencyMems ?? []).length === 0 ? (
          <p className="text-muted-foreground p-6 text-center text-sm italic">No memberships.</p>
        ) : (
          <ul className="divide-border divide-y text-sm">
            {(orgMems ?? []).map((m) => {
              const org = m.organizations as { name: string; slug: string } | null;
              return (
                <li
                  key={`org-${m.org_id}`}
                  className="flex items-center justify-between px-5 py-2.5"
                >
                  <div>
                    <Link
                      href={`/arbor/orgs/${m.org_id}`}
                      className="text-foreground hover:text-primary font-medium"
                    >
                      {org?.name ?? m.org_id.slice(0, 8)}
                    </Link>
                    <p className="text-muted-foreground mt-0.5 font-mono text-xs">
                      org · {org?.slug ?? "—"}
                    </p>
                  </div>
                  <span className="text-muted-foreground text-xs capitalize">{m.role}</span>
                </li>
              );
            })}
            {(agencyMems ?? []).map((m) => {
              const ag = m.agencies as { name: string; slug: string } | null;
              return (
                <li
                  key={`ag-${m.agency_id}`}
                  className="flex items-center justify-between px-5 py-2.5"
                >
                  <div>
                    <Link
                      href={`/arbor/agencies/${m.agency_id}`}
                      className="text-foreground hover:text-primary font-medium"
                    >
                      {ag?.name ?? m.agency_id.slice(0, 8)}
                    </Link>
                    <p className="text-muted-foreground mt-0.5 font-mono text-xs">
                      agency · {ag?.slug ?? "—"}
                    </p>
                  </div>
                  <span className="text-muted-foreground text-xs capitalize">{m.role}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Recent activity */}
      <section className="border-border bg-background overflow-hidden rounded-xl border">
        <div className="border-border border-b px-5 py-3">
          <h2 className="text-foreground text-base font-bold">Recent activity (last 30)</h2>
        </div>
        {(recentAudit ?? []).length === 0 ? (
          <p className="text-muted-foreground p-6 text-center text-sm italic">No activity.</p>
        ) : (
          <ul className="divide-border divide-y text-sm">
            {(recentAudit ?? []).map((e) => (
              <li key={e.id} className="px-5 py-2">
                <p className="text-foreground font-mono text-xs">{e.operation}</p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {e.table_name} · {e.occurred_at.replace("T", " ").slice(0, 16)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Actions */}
      <UserActions userId={user.id} userEmail={user.email ?? "(no email)"} isSuspended={isBanned} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <p className="text-foreground mt-1 font-mono text-sm">{value}</p>
    </div>
  );
}
