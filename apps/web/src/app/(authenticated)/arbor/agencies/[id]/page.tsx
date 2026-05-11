import Link from "next/link";
import { notFound } from "next/navigation";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { createAdminClient } from "@/lib/supabase/admin";
import AgencySettingsControls from "./agency-settings-controls";

export const metadata = { title: "Agency" };

export default async function ArborAgencyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createAdminClient();

  const [
    { data: agency },
    { data: orgs },
    { data: contracts },
    { data: invoices },
    { data: members },
  ] = await Promise.all([
    admin.from("agencies").select("*").eq("id", id).maybeSingle(),
    admin
      .from("organizations")
      .select("id, name, slug, preset_key, created_at, suspended_at")
      .eq("agency_id", id)
      .order("name"),
    admin
      .from("client_contracts")
      .select(
        "id, org_id, pricing_tier, annual_contract_value_cents, revenue_share_pct, status, contract_start, contract_end",
      )
      .eq("agency_id", id)
      .order("created_at", { ascending: false }),
    admin
      .from("arbor_invoices")
      .select(
        "id, invoice_number, period_start, period_end, total_cents, status, issued_at, paid_at",
      )
      .eq("agency_id", id)
      .order("issued_at", { ascending: false })
      .limit(50),
    admin
      .from("agency_memberships")
      .select("user_id, role, accepted_at, invited_at")
      .eq("agency_id", id)
      .order("accepted_at", { ascending: false }),
  ]);

  if (!agency) notFound();

  const activeContractsACV = (contracts ?? [])
    .filter((c) => c.status === "active")
    .reduce((s, c) => s + c.annual_contract_value_cents, 0);

  // Resolve member emails via admin.listUsers — paginated lookup
  const memberUserIds = new Set((members ?? []).map((m) => m.user_id));
  const { data: usersResp } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const userMap = new Map(
    usersResp.users.filter((u) => memberUserIds.has(u.id)).map((u) => [u.id, u]),
  );

  return (
    <div className="space-y-6 p-6">
      <header>
        <Link
          href="/arbor/agencies"
          className="text-muted-foreground hover:text-foreground text-xs"
        >
          ← All agencies
        </Link>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-foreground text-2xl font-bold">{agency.name}</h1>
            <p className="text-muted-foreground mt-1 font-mono text-xs">{agency.slug}</p>
          </div>
          <div className="text-right">
            {agency.suspended_at ? (
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

      {agency.suspended_at && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 dark:bg-rose-900/20">
          <p className="text-sm font-semibold text-rose-900 dark:text-rose-200">
            This agency is suspended.
          </p>
          <p className="mt-1 text-xs text-rose-800 dark:text-rose-300/90">
            Suspended {agency.suspended_at.slice(0, 10)}.{" "}
            {agency.suspended_reason ? `Reason: ${agency.suspended_reason}` : ""}
          </p>
        </div>
      )}

      {/* Overview */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Client orgs" value={(orgs ?? []).length.toString()} />
        <StatTile
          label="Active contracts"
          value={(contracts ?? []).filter((c) => c.status === "active").length.toString()}
        />
        <StatTile label="Total ACV" value={formatCents(activeContractsACV)} />
        <StatTile
          label="Default rev share"
          value={`${(agency.default_revenue_share_pct / 100).toFixed(0)}%`}
          sub={`Net ${agency.payment_terms_days.toString()} terms`}
        />
      </section>

      {/* Custom domain */}
      <section className="border-border bg-background space-y-2 rounded-xl border p-5">
        <h2 className="text-foreground text-base font-bold">Custom domain</h2>
        {agency.custom_domain ? (
          <p className="text-foreground text-sm">
            <span className="font-mono">{agency.custom_domain}</span>{" "}
            <span className="ml-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              ✓ Verified {agency.custom_domain_verified_at?.slice(0, 10) ?? ""}
            </span>
          </p>
        ) : agency.custom_domain_pending ? (
          <p className="text-foreground text-sm">
            <span className="font-mono">{agency.custom_domain_pending}</span>{" "}
            <span className="ml-2 text-xs font-medium text-amber-700 dark:text-amber-400">
              Awaiting DNS verification
            </span>
          </p>
        ) : (
          <p className="text-muted-foreground text-sm italic">No custom domain configured.</p>
        )}
      </section>

      {/* Client orgs */}
      <section className="border-border bg-background overflow-hidden rounded-xl border">
        <div className="border-border border-b px-5 py-3">
          <h2 className="text-foreground text-base font-bold">
            Client orgs ({(orgs ?? []).length.toString()})
          </h2>
        </div>
        {(orgs ?? []).length === 0 ? (
          <p className="text-muted-foreground p-6 text-center text-sm italic">
            No client orgs yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface text-muted-foreground border-border border-b text-xs uppercase">
                <tr>
                  <th className="px-5 py-2.5 text-left font-medium">Name</th>
                  <th className="px-5 py-2.5 text-left font-medium">Preset</th>
                  <th className="px-5 py-2.5 text-left font-medium">Created</th>
                  <th className="px-5 py-2.5 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {(orgs ?? []).map((o) => (
                  <tr key={o.id} className="hover:bg-surface">
                    <td className="px-5 py-2">
                      <Link
                        href={`/arbor/orgs/${o.id}`}
                        className="text-foreground hover:text-primary font-medium"
                      >
                        {o.name}
                      </Link>
                      <p className="text-muted-foreground mt-0.5 font-mono text-xs">{o.slug}</p>
                    </td>
                    <td className="text-muted-foreground px-5 py-2 capitalize">
                      {o.preset_key.replace(/_/g, " ")}
                    </td>
                    <td className="text-foreground px-5 py-2 tabular-nums">
                      {o.created_at.slice(0, 10)}
                    </td>
                    <td className="px-5 py-2 text-xs">
                      {o.suspended_at ? (
                        <span className="text-destructive">Suspended</span>
                      ) : (
                        <span className="text-emerald-700 dark:text-emerald-400">Active</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Contracts */}
      <section className="border-border bg-background overflow-hidden rounded-xl border">
        <div className="border-border border-b px-5 py-3">
          <h2 className="text-foreground text-base font-bold">
            Contracts ({(contracts ?? []).length.toString()})
          </h2>
        </div>
        {(contracts ?? []).length === 0 ? (
          <p className="text-muted-foreground p-6 text-center text-sm italic">No contracts yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface text-muted-foreground border-border border-b text-xs uppercase">
                <tr>
                  <th className="px-5 py-2.5 text-left font-medium">Tier</th>
                  <th className="px-5 py-2.5 text-right font-medium">ACV</th>
                  <th className="px-5 py-2.5 text-right font-medium">Rev share</th>
                  <th className="px-5 py-2.5 text-left font-medium">Period</th>
                  <th className="px-5 py-2.5 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {(contracts ?? []).map((c) => (
                  <tr key={c.id}>
                    <td className="text-foreground px-5 py-2 capitalize">{c.pricing_tier}</td>
                    <td className="text-foreground px-5 py-2 text-right tabular-nums">
                      {formatCents(c.annual_contract_value_cents)}
                    </td>
                    <td className="text-foreground px-5 py-2 text-right tabular-nums">
                      {((c.revenue_share_pct ?? agency.default_revenue_share_pct) / 100).toFixed(0)}
                      %
                    </td>
                    <td className="text-muted-foreground px-5 py-2 text-xs tabular-nums">
                      {c.contract_start} → {c.contract_end ?? "open"}
                    </td>
                    <td className="px-5 py-2 text-xs capitalize">{c.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Invoices */}
      <section className="border-border bg-background overflow-hidden rounded-xl border">
        <div className="border-border border-b px-5 py-3">
          <h2 className="text-foreground text-base font-bold">
            Invoices ({(invoices ?? []).length.toString()})
          </h2>
        </div>
        {(invoices ?? []).length === 0 ? (
          <p className="text-muted-foreground p-6 text-center text-sm italic">No invoices yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface text-muted-foreground border-border border-b text-xs uppercase">
                <tr>
                  <th className="px-5 py-2.5 text-left font-medium">Number</th>
                  <th className="px-5 py-2.5 text-left font-medium">Period</th>
                  <th className="px-5 py-2.5 text-right font-medium">Total</th>
                  <th className="px-5 py-2.5 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {(invoices ?? []).map((i) => (
                  <tr key={i.id}>
                    <td className="text-foreground px-5 py-2 font-mono text-xs">
                      <Link href={`/agency/billing/${i.id}`} className="hover:text-primary">
                        {i.invoice_number}
                      </Link>
                    </td>
                    <td className="text-muted-foreground px-5 py-2 text-xs tabular-nums">
                      {i.period_start} → {i.period_end}
                    </td>
                    <td className="text-foreground px-5 py-2 text-right tabular-nums">
                      {formatCents(i.total_cents)}
                    </td>
                    <td className="px-5 py-2 text-xs capitalize">{i.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Members */}
      <section className="border-border bg-background overflow-hidden rounded-xl border">
        <div className="border-border border-b px-5 py-3">
          <h2 className="text-foreground text-base font-bold">
            Members ({(members ?? []).length.toString()})
          </h2>
        </div>
        {(members ?? []).length === 0 ? (
          <p className="text-muted-foreground p-6 text-center text-sm italic">No members yet.</p>
        ) : (
          <ul className="divide-border divide-y text-sm">
            {(members ?? []).map((m) => {
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

      {/* Settings */}
      <AgencySettingsControls
        agencyId={agency.id}
        agencyName={agency.name}
        defaultRevSharePct={agency.default_revenue_share_pct}
        paymentTermsDays={agency.payment_terms_days}
        isSuspended={!!agency.suspended_at}
      />
    </div>
  );
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border-border bg-background rounded-xl border p-4">
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <p className="text-foreground mt-2 text-2xl font-bold tabular-nums">{value}</p>
      {sub && <p className="text-muted-foreground mt-1 text-xs">{sub}</p>}
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
