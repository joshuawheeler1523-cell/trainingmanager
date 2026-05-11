import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Overview" };

export default async function ArborOverviewPage() {
  const admin = createAdminClient();

  // Pull the headline counts in parallel. Use head:true count queries to
  // avoid pulling row data we don't need.
  const [
    agenciesCount,
    suspendedAgenciesCount,
    orgsCount,
    activeContracts,
    invoicesOutstanding,
    recentSignups,
    recentActivity,
  ] = await Promise.all([
    admin.from("agencies").select("id", { count: "exact", head: true }),
    admin
      .from("agencies")
      .select("id", { count: "exact", head: true })
      .not("suspended_at", "is", null),
    admin.from("organizations").select("id", { count: "exact", head: true }),
    admin
      .from("client_contracts")
      .select("annual_contract_value_cents, revenue_share_pct")
      .eq("status", "active"),
    admin.from("arbor_invoices").select("total_cents").in("status", ["sent", "overdue"]),
    admin
      .from("agencies")
      .select("id, name, slug, created_at")
      .order("created_at", { ascending: false })
      .limit(10),
    admin
      .from("audit_log")
      .select("id, occurred_at, operation, table_name, record_id, org_id")
      .order("occurred_at", { ascending: false })
      .limit(20),
  ]);

  const totalACV = (activeContracts.data ?? []).reduce(
    (sum, c) => sum + c.annual_contract_value_cents,
    0,
  );
  const totalOutstanding = (invoicesOutstanding.data ?? []).reduce(
    (sum, i) => sum + i.total_cents,
    0,
  );
  // Default-30% if a contract didn't override
  const monthlyRevShareOwed = Math.floor(
    (activeContracts.data ?? []).reduce(
      (sum, c) => sum + (c.annual_contract_value_cents * (c.revenue_share_pct ?? 3000)) / 10000,
      0,
    ) / 12,
  );

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-foreground text-2xl font-bold">Overview</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Cross-platform health: every agency, every client org, every dollar in flight.
        </p>
      </header>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <Kpi
          label="Agencies"
          value={(agenciesCount.count ?? 0).toString()}
          sub={`${(suspendedAgenciesCount.count ?? 0).toString()} suspended`}
          href="/arbor/agencies"
        />
        <Kpi label="Client orgs" value={(orgsCount.count ?? 0).toString()} href="/arbor/orgs" />
        <Kpi
          label="Active contracts"
          value={(activeContracts.data ?? []).length.toString()}
          sub="across all agencies"
          href="/arbor/billing"
        />
        <Kpi label="Total ACV" value={formatCents(totalACV)} sub="annual contract value" />
        <Kpi
          label="Monthly rev-share"
          value={formatCents(monthlyRevShareOwed)}
          sub={`${formatCents(totalOutstanding)} outstanding`}
          href="/arbor/billing"
          tone={totalOutstanding > 0 ? "warning" : "ok"}
        />
      </div>

      {/* Recent + activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="border-border bg-background overflow-hidden rounded-xl border">
          <div className="border-border border-b px-5 py-3">
            <h2 className="text-foreground text-sm font-bold">Recent agency signups</h2>
          </div>
          {(recentSignups.data ?? []).length === 0 ? (
            <p className="text-muted-foreground p-6 text-center text-sm italic">No agencies yet.</p>
          ) : (
            <ul className="divide-border divide-y">
              {(recentSignups.data ?? []).map((a) => (
                <li key={a.id} className="px-5 py-3">
                  <Link
                    href={`/arbor/agencies/${a.id}`}
                    className="text-foreground hover:text-primary block text-sm font-medium"
                  >
                    {a.name}
                  </Link>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {a.slug} · {a.created_at.replace("T", " ").slice(0, 16)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="border-border bg-background overflow-hidden rounded-xl border">
          <div className="border-border border-b px-5 py-3">
            <h2 className="text-foreground text-sm font-bold">Recent activity</h2>
          </div>
          {(recentActivity.data ?? []).length === 0 ? (
            <p className="text-muted-foreground p-6 text-center text-sm italic">No activity yet.</p>
          ) : (
            <ul className="divide-border divide-y text-sm">
              {(recentActivity.data ?? []).map((e) => (
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
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  href,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  href?: string;
  tone?: "warning" | "ok";
}) {
  const Wrapper = href
    ? ({ children }: { children: React.ReactNode }) => (
        <Link
          href={href}
          className="border-border bg-background hover:border-primary block rounded-xl border p-4 transition-colors"
        >
          {children}
        </Link>
      )
    : ({ children }: { children: React.ReactNode }) => (
        <div className="border-border bg-background rounded-xl border p-4">{children}</div>
      );
  return (
    <Wrapper>
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <p
        className="mt-2 text-2xl font-bold tabular-nums tracking-tight"
        style={{ color: tone === "warning" ? "var(--destructive)" : "var(--foreground)" }}
      >
        {value}
      </p>
      {sub && <p className="text-muted-foreground mt-1 text-xs">{sub}</p>}
    </Wrapper>
  );
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
