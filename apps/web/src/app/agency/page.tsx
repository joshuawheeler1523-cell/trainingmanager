import Link from "next/link";
import { BuildingOffice2Icon, UserGroupIcon, PlusIcon } from "@heroicons/react/24/outline";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgencyId } from "@/lib/auth/agency";

/**
 * Agency console dashboard. Lists every client org belonging to the agency
 * with a quick seat count + a link to switch into that org.
 *
 * The agency_admin layer (this layout) confirms the caller is agency_admin
 * before rendering. Switching INTO a client org goes through the existing
 * /org switch action — agency_admin is NOT auto-promoted to manager of the
 * client org; they must have an explicit org_membership.
 */
export default async function AgencyDashboardPage() {
  const supabase = await createClient();
  const agencyId = await getCurrentAgencyId();
  if (!agencyId) return null; // layout already redirected

  // Pull every org belonging to this agency (RLS lets agency_admin SELECT).
  // Plus seat counts via a separate aggregation.
  const [{ data: orgs }, { data: memberships }] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name, slug, preset_key, created_at")
      .eq("agency_id", agencyId)
      .order("name"),
    supabase.from("org_memberships").select("org_id, role").not("accepted_at", "is", null),
  ]);

  // Group memberships by org_id for seat counting.
  const seatsByOrg = new Map<
    string,
    { total: number; managers: number; instructors: number; viewers: number }
  >();
  for (const m of memberships ?? []) {
    const existing = seatsByOrg.get(m.org_id) ?? {
      total: 0,
      managers: 0,
      instructors: 0,
      viewers: 0,
    };
    existing.total += 1;
    if (m.role === "manager") existing.managers += 1;
    else if (m.role === "instructor") existing.instructors += 1;
    else if (m.role === "viewer") existing.viewers += 1;
    seatsByOrg.set(m.org_id, existing);
  }

  const orgList = orgs ?? [];
  const totalSeats = orgList.reduce((sum, o) => sum + (seatsByOrg.get(o.id)?.total ?? 0), 0);

  return (
    <div className="space-y-6 p-6">
      {/* Summary strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard
          icon={<BuildingOffice2Icon className="h-5 w-5" />}
          label="Client organizations"
          value={orgList.length.toString()}
        />
        <SummaryCard
          icon={<UserGroupIcon className="h-5 w-5" />}
          label="Total active seats"
          value={totalSeats.toString()}
          sub="across all client orgs"
        />
        <Link
          href="/agency/clients/new"
          className="border-border bg-background hover:border-primary group flex items-center justify-between rounded-xl border p-5 transition-colors"
        >
          <div>
            <p className="text-muted-foreground text-xs font-medium">Quick action</p>
            <p className="text-foreground group-hover:text-primary mt-1 text-base font-semibold">
              + Provision a new client org
            </p>
          </div>
          <PlusIcon className="text-muted-foreground group-hover:text-primary h-5 w-5" />
        </Link>
      </div>

      {/* Client org table */}
      <section className="border-border bg-background rounded-xl border">
        <div className="border-border border-b px-5 py-4">
          <h2 className="text-foreground text-base font-bold">Client organizations</h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Every org belonging to your agency. Switch into one to operate as its manager (requires
            an explicit org_membership; click the org name to enter its workspace).
          </p>
        </div>
        {orgList.length === 0 ? (
          <div className="text-muted-foreground p-8 text-center text-sm">
            <p>No client orgs yet.</p>
            <p className="mt-2">
              <Link href="/agency/clients/new" className="text-primary hover:underline">
                Provision your first one →
              </Link>
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface border-border border-b">
              <tr>
                <th className="text-muted-foreground px-5 py-2.5 text-left text-xs font-medium">
                  Name
                </th>
                <th className="text-muted-foreground px-5 py-2.5 text-left text-xs font-medium">
                  Preset
                </th>
                <th className="text-muted-foreground px-5 py-2.5 text-right text-xs font-medium">
                  Managers
                </th>
                <th className="text-muted-foreground px-5 py-2.5 text-right text-xs font-medium">
                  Instructors
                </th>
                <th className="text-muted-foreground px-5 py-2.5 text-right text-xs font-medium">
                  Viewers
                </th>
                <th className="text-muted-foreground px-5 py-2.5 text-right text-xs font-medium">
                  Total seats
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {orgList.map((org) => {
                const seats = seatsByOrg.get(org.id);
                return (
                  <tr key={org.id} className="hover:bg-surface">
                    <td className="px-5 py-3">
                      <Link
                        href={`/?org=${org.id}`}
                        className="text-foreground hover:text-primary font-medium"
                      >
                        {org.name}
                      </Link>
                      <p className="text-muted-foreground mt-0.5 text-xs">{org.slug}</p>
                    </td>
                    <td className="text-muted-foreground px-5 py-3 text-xs">
                      {org.preset_key.replace(/_/g, " ")}
                    </td>
                    <td className="text-foreground px-5 py-3 text-right tabular-nums">
                      {seats?.managers ?? 0}
                    </td>
                    <td className="text-foreground px-5 py-3 text-right tabular-nums">
                      {seats?.instructors ?? 0}
                    </td>
                    <td className="text-foreground px-5 py-3 text-right tabular-nums">
                      {seats?.viewers ?? 0}
                    </td>
                    <td className="text-foreground px-5 py-3 text-right text-sm font-semibold tabular-nums">
                      {seats?.total ?? 0}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="border-border bg-background rounded-xl border p-5">
      <div className="flex items-start justify-between">
        <p className="text-muted-foreground text-xs font-medium">{label}</p>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <p className="text-foreground mt-2 text-3xl font-bold tabular-nums">{value}</p>
      {sub && <p className="text-muted-foreground mt-1 text-xs">{sub}</p>}
    </div>
  );
}
