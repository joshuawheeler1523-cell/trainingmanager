import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Audit log" };

const PAGE_SIZE = 100;

export default async function ArborAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ table?: string; op?: string; org?: string; cursor?: string }>;
}) {
  const params = await searchParams;
  const admin = createAdminClient();

  let query = admin
    .from("audit_log")
    .select("id, occurred_at, actor_id, operation, table_name, record_id, org_id")
    .order("occurred_at", { ascending: false })
    .limit(PAGE_SIZE);

  if (params.table) query = query.eq("table_name", params.table);
  if (params.op) query = query.eq("operation", params.op);
  if (params.org) query = query.eq("org_id", params.org);
  if (params.cursor) query = query.lt("occurred_at", params.cursor);

  const [{ data: rows }, { data: ops }, { data: tables }, { data: orgs }, { data: agencies }] =
    await Promise.all([
      query,
      admin.from("audit_log").select("operation").order("operation").limit(1000),
      admin.from("audit_log").select("table_name").order("table_name").limit(1000),
      admin.from("organizations").select("id, name, agency_id").order("name"),
      admin.from("agencies").select("id, name").order("name"),
    ]);

  const entries = rows ?? [];
  const lastEntry = entries[entries.length - 1];
  const nextCursor = entries.length === PAGE_SIZE && lastEntry ? lastEntry.occurred_at : null;

  const distinctOps = Array.from(new Set((ops ?? []).map((r) => r.operation))).sort();
  const distinctTables = Array.from(new Set((tables ?? []).map((r) => r.table_name))).sort();

  // org_id can be a real org id, or for Arbor admin events: an agency id
  // (surrogate convention) or a user id. Resolve display names.
  const orgNameById = new Map((orgs ?? []).map((o) => [o.id, o.name]));
  const agencyNameById = new Map((agencies ?? []).map((a) => [a.id, a.name]));

  const buildHref = (overrides: Record<string, string | undefined>) => {
    const merged = { ...params, ...overrides };
    const search = new URLSearchParams();
    if (merged.table) search.set("table", merged.table);
    if (merged.op) search.set("op", merged.op);
    if (merged.org) search.set("org", merged.org);
    if (merged.cursor) search.set("cursor", merged.cursor);
    const qs = search.toString();
    return `/arbor/audit${qs ? `?${qs}` : ""}`;
  };

  // CSV export of the visible page
  const csvRows = [
    ["occurred_at", "operation", "table_name", "record_id", "actor_id", "org_id"].join(","),
    ...entries.map((e) =>
      [e.occurred_at, e.operation, e.table_name, e.record_id, e.actor_id ?? "", e.org_id].join(","),
    ),
  ];
  const csvBlob = csvRows.join("\n");

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-foreground text-2xl font-bold">Audit log</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Every mutating operation across every tenant. Newest first.
        </p>
      </header>

      {/* Filter form */}
      <form className="border-border bg-background flex flex-wrap items-end gap-3 rounded-xl border p-4 text-sm">
        <div>
          <label htmlFor="table" className="text-foreground mb-1 block text-xs font-medium">
            Table
          </label>
          <select
            id="table"
            name="table"
            defaultValue={params.table ?? ""}
            className="border-input bg-background text-foreground rounded-md border px-3 py-1.5 text-sm"
          >
            <option value="">All tables</option>
            {distinctTables.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="op" className="text-foreground mb-1 block text-xs font-medium">
            Operation
          </label>
          <select
            id="op"
            name="op"
            defaultValue={params.op ?? ""}
            className="border-input bg-background text-foreground rounded-md border px-3 py-1.5 text-sm"
          >
            <option value="">All operations</option>
            {distinctOps.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="org" className="text-foreground mb-1 block text-xs font-medium">
            Org
          </label>
          <select
            id="org"
            name="org"
            defaultValue={params.org ?? ""}
            className="border-input bg-background text-foreground rounded-md border px-3 py-1.5 text-sm"
          >
            <option value="">All</option>
            {(orgs ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
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
        {(params.table || params.op || params.org) && (
          <Link
            href="/arbor/audit"
            className="text-muted-foreground hover:text-foreground text-xs underline"
          >
            Clear
          </Link>
        )}
        <a
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(csvBlob)}`}
          download={`arbor-audit-${new Date().toISOString().slice(0, 10)}.csv`}
          className="border-border text-foreground hover:bg-surface ml-auto rounded-md border px-3 py-1.5 text-xs font-medium"
        >
          Download CSV (this page)
        </a>
      </form>

      {/* Entries */}
      <section className="border-border bg-background overflow-hidden rounded-xl border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface text-muted-foreground border-border border-b text-xs uppercase">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">When</th>
                <th className="px-4 py-2.5 text-left font-medium">Operation</th>
                <th className="px-4 py-2.5 text-left font-medium">Table</th>
                <th className="px-4 py-2.5 text-left font-medium">Org / surrogate</th>
                <th className="px-4 py-2.5 text-left font-medium">Actor</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-muted-foreground p-8 text-center italic">
                    No matching entries.
                  </td>
                </tr>
              ) : (
                entries.map((e) => {
                  const orgLabel =
                    orgNameById.get(e.org_id) ??
                    agencyNameById.get(e.org_id) ??
                    e.org_id.slice(0, 8);
                  return (
                    <tr key={e.id} className="hover:bg-surface align-top">
                      <td className="text-foreground whitespace-nowrap px-4 py-2 text-xs tabular-nums">
                        {e.occurred_at.replace("T", " ").slice(0, 19)}
                      </td>
                      <td className="text-foreground px-4 py-2 font-mono text-xs">{e.operation}</td>
                      <td className="text-muted-foreground px-4 py-2 font-mono text-xs">
                        {e.table_name}
                      </td>
                      <td className="text-foreground px-4 py-2 text-xs">
                        {orgNameById.has(e.org_id) ? (
                          <Link href={`/arbor/orgs/${e.org_id}`} className="hover:text-primary">
                            {orgLabel}
                          </Link>
                        ) : agencyNameById.has(e.org_id) ? (
                          <Link href={`/arbor/agencies/${e.org_id}`} className="hover:text-primary">
                            {orgLabel}
                          </Link>
                        ) : (
                          <span className="font-mono text-xs">{orgLabel}</span>
                        )}
                      </td>
                      <td className="text-muted-foreground px-4 py-2 font-mono text-xs">
                        {e.actor_id ? (
                          <Link href={`/arbor/users/${e.actor_id}`} className="hover:text-primary">
                            {e.actor_id.slice(0, 8)}
                          </Link>
                        ) : (
                          <em>system</em>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs">
        <p className="text-muted-foreground">
          Showing {entries.length.toString()} entr{entries.length === 1 ? "y" : "ies"}.
        </p>
        {nextCursor && (
          <Link
            href={buildHref({ cursor: nextCursor })}
            className="border-border text-foreground hover:bg-surface rounded-md border px-3 py-1.5 text-sm font-medium"
          >
            Older →
          </Link>
        )}
      </div>
    </div>
  );
}
