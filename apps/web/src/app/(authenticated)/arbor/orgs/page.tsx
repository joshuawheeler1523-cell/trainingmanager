import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Organizations" };

export default async function ArborOrgsPage({
  searchParams,
}: {
  searchParams: Promise<{ agency?: string }>;
}) {
  const params = await searchParams;
  const admin = createAdminClient();

  let orgQuery = admin
    .from("organizations")
    .select("id, name, slug, preset_key, agency_id, created_at, suspended_at")
    .order("created_at", { ascending: false });

  if (params.agency === "standalone") orgQuery = orgQuery.is("agency_id", null);
  else if (params.agency) orgQuery = orgQuery.eq("agency_id", params.agency);

  const [{ data: orgs }, { data: agencies }, { data: memberships }] = await Promise.all([
    orgQuery,
    admin.from("agencies").select("id, name").order("name"),
    admin.from("org_memberships").select("org_id").not("accepted_at", "is", null),
  ]);

  const memberCountByOrg = new Map<string, number>();
  for (const m of memberships ?? []) {
    memberCountByOrg.set(m.org_id, (memberCountByOrg.get(m.org_id) ?? 0) + 1);
  }
  const agencyNameById = new Map((agencies ?? []).map((a) => [a.id, a.name]));

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-foreground text-2xl font-bold">Organizations</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Every client org across every agency, plus standalone orgs.
        </p>
      </header>

      {/* Filter */}
      <form className="border-border bg-background flex flex-wrap items-end gap-3 rounded-xl border p-4 text-sm">
        <div>
          <label htmlFor="agency" className="text-foreground mb-1 block text-xs font-medium">
            Parent agency
          </label>
          <select
            id="agency"
            name="agency"
            defaultValue={params.agency ?? ""}
            className="border-input bg-background text-foreground rounded-md border px-3 py-1.5 text-sm"
          >
            <option value="">All orgs</option>
            <option value="standalone">Standalone (no agency)</option>
            {(agencies ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm font-medium hover:opacity-90"
        >
          Filter
        </button>
        {params.agency && (
          <Link
            href="/arbor/orgs"
            className="text-muted-foreground hover:text-foreground text-xs underline"
          >
            Clear
          </Link>
        )}
      </form>

      <section className="border-border bg-background overflow-hidden rounded-xl border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface text-muted-foreground border-border border-b text-xs uppercase">
              <tr>
                <th className="px-5 py-2.5 text-left font-medium">Org</th>
                <th className="px-5 py-2.5 text-left font-medium">Agency</th>
                <th className="px-5 py-2.5 text-left font-medium">Preset</th>
                <th className="px-5 py-2.5 text-right font-medium">Members</th>
                <th className="px-5 py-2.5 text-left font-medium">Status</th>
                <th className="px-5 py-2.5 text-left font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {(orgs ?? []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-muted-foreground p-8 text-center italic">
                    No organizations match.
                  </td>
                </tr>
              ) : (
                (orgs ?? []).map((o) => (
                  <tr key={o.id} className="hover:bg-surface">
                    <td className="px-5 py-2.5">
                      <Link
                        href={`/arbor/orgs/${o.id}`}
                        className="text-foreground hover:text-primary font-medium"
                      >
                        {o.name}
                      </Link>
                      <p className="text-muted-foreground mt-0.5 font-mono text-xs">{o.slug}</p>
                    </td>
                    <td className="text-foreground px-5 py-2.5 text-xs">
                      {o.agency_id ? (
                        <Link
                          href={`/arbor/agencies/${o.agency_id}`}
                          className="hover:text-primary"
                        >
                          {agencyNameById.get(o.agency_id) ?? "Unknown"}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground italic">standalone</span>
                      )}
                    </td>
                    <td className="text-muted-foreground px-5 py-2.5 text-xs capitalize">
                      {o.preset_key.replace(/_/g, " ")}
                    </td>
                    <td className="text-foreground px-5 py-2.5 text-right tabular-nums">
                      {(memberCountByOrg.get(o.id) ?? 0).toString()}
                    </td>
                    <td className="px-5 py-2.5 text-xs">
                      {o.suspended_at ? (
                        <span className="text-destructive font-medium">Suspended</span>
                      ) : (
                        <span className="text-emerald-700 dark:text-emerald-400">Active</span>
                      )}
                    </td>
                    <td className="text-foreground px-5 py-2.5 tabular-nums">
                      {o.created_at.slice(0, 10)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
