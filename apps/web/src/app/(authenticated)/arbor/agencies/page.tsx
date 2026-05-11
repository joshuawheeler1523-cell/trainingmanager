import Link from "next/link";
import { PlusIcon } from "@heroicons/react/24/outline";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Agencies" };

export default async function ArborAgenciesPage() {
  const admin = createAdminClient();

  const [{ data: agencies }, { data: orgs }, { data: contracts }] = await Promise.all([
    admin
      .from("agencies")
      .select("id, name, slug, created_at, custom_domain, custom_domain_verified_at, suspended_at")
      .order("created_at", { ascending: false }),
    admin.from("organizations").select("id, agency_id"),
    admin.from("client_contracts").select("agency_id, annual_contract_value_cents, status"),
  ]);

  const orgCountByAgency = new Map<string, number>();
  for (const o of orgs ?? []) {
    if (o.agency_id) {
      orgCountByAgency.set(o.agency_id, (orgCountByAgency.get(o.agency_id) ?? 0) + 1);
    }
  }

  const acvByAgency = new Map<string, number>();
  const activeContractsByAgency = new Map<string, number>();
  for (const c of contracts ?? []) {
    if (c.status === "active") {
      acvByAgency.set(
        c.agency_id,
        (acvByAgency.get(c.agency_id) ?? 0) + c.annual_contract_value_cents,
      );
      activeContractsByAgency.set(c.agency_id, (activeContractsByAgency.get(c.agency_id) ?? 0) + 1);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-foreground text-2xl font-bold">Agencies</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Every reseller agency on the platform.
          </p>
        </div>
        <Link
          href="/arbor/agencies/new"
          className="bg-primary text-primary-foreground inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium hover:opacity-90"
        >
          <PlusIcon className="h-4 w-4" />
          New agency
        </Link>
      </header>

      <section className="border-border bg-background overflow-hidden rounded-xl border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface text-muted-foreground border-border border-b text-xs uppercase">
              <tr>
                <th className="px-5 py-2.5 text-left font-medium">Agency</th>
                <th className="px-5 py-2.5 text-right font-medium">Client orgs</th>
                <th className="px-5 py-2.5 text-right font-medium">Active contracts</th>
                <th className="px-5 py-2.5 text-right font-medium">Total ACV</th>
                <th className="px-5 py-2.5 text-left font-medium">Custom domain</th>
                <th className="px-5 py-2.5 text-left font-medium">Status</th>
                <th className="px-5 py-2.5 text-left font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {(agencies ?? []).length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-muted-foreground p-8 text-center italic">
                    No agencies yet.{" "}
                    <Link href="/arbor/agencies/new" className="text-primary underline">
                      Create the first one
                    </Link>
                    .
                  </td>
                </tr>
              ) : (
                (agencies ?? []).map((a) => (
                  <tr key={a.id} className="hover:bg-surface">
                    <td className="px-5 py-3">
                      <Link
                        href={`/arbor/agencies/${a.id}`}
                        className="text-foreground hover:text-primary font-medium"
                      >
                        {a.name}
                      </Link>
                      <p className="text-muted-foreground mt-0.5 font-mono text-xs">{a.slug}</p>
                    </td>
                    <td className="text-foreground px-5 py-3 text-right tabular-nums">
                      {(orgCountByAgency.get(a.id) ?? 0).toString()}
                    </td>
                    <td className="text-foreground px-5 py-3 text-right tabular-nums">
                      {(activeContractsByAgency.get(a.id) ?? 0).toString()}
                    </td>
                    <td className="text-foreground px-5 py-3 text-right font-semibold tabular-nums">
                      {formatCents(acvByAgency.get(a.id) ?? 0)}
                    </td>
                    <td className="text-muted-foreground px-5 py-3 font-mono text-xs">
                      {a.custom_domain ? (
                        <span
                          className={
                            a.custom_domain_verified_at
                              ? "text-emerald-700 dark:text-emerald-400"
                              : "text-amber-700 dark:text-amber-400"
                          }
                        >
                          {a.custom_domain}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-5 py-3 text-xs">
                      {a.suspended_at ? (
                        <span className="text-destructive font-medium">Suspended</span>
                      ) : (
                        <span className="text-emerald-700 dark:text-emerald-400">Active</span>
                      )}
                    </td>
                    <td className="text-foreground px-5 py-3 tabular-nums">
                      {a.created_at.slice(0, 10)}
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

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
