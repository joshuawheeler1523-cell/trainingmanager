import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { isManager } from "@/lib/auth/role";
import PageHeader from "@/components/ui/page-header";

const PAGE_SIZE = 100;

export const metadata = { title: "Audit log — Arbor" };

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ table?: string; op?: string; cursor?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const orgId = await getCurrentOrgId();
  if (!orgId) return null;
  if (!(await isManager(orgId))) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground text-sm">Manager access required.</p>
      </div>
    );
  }

  let query = supabase
    .from("audit_log")
    .select(
      "id, occurred_at, actor_id, operation, table_name, record_id, changed_fields, new_values",
    )
    .eq("org_id", orgId)
    .order("occurred_at", { ascending: false })
    .limit(PAGE_SIZE);

  if (params.table) query = query.eq("table_name", params.table);
  if (params.op) query = query.eq("operation", params.op);
  if (params.cursor) query = query.lt("occurred_at", params.cursor);

  const { data: rows } = await query;
  const entries = rows ?? [];
  const lastEntry = entries[entries.length - 1];
  const nextCursor = entries.length === PAGE_SIZE && lastEntry ? lastEntry.occurred_at : null;

  // Fetch distinct operations + tables for the filter dropdowns. Cap at
  // a reasonable number to keep the page lightweight.
  const [{ data: ops }, { data: tables }] = await Promise.all([
    supabase
      .from("audit_log")
      .select("operation")
      .eq("org_id", orgId)
      .order("operation")
      .limit(500),
    supabase
      .from("audit_log")
      .select("table_name")
      .eq("org_id", orgId)
      .order("table_name")
      .limit(500),
  ]);
  const distinctOps = Array.from(new Set((ops ?? []).map((r) => r.operation))).sort();
  const distinctTables = Array.from(new Set((tables ?? []).map((r) => r.table_name))).sort();

  const buildHref = (overrides: Record<string, string | undefined>) => {
    const merged = { ...params, ...overrides };
    const search = new URLSearchParams();
    if (merged.table) search.set("table", merged.table);
    if (merged.op) search.set("op", merged.op);
    if (merged.cursor) search.set("cursor", merged.cursor);
    const qs = search.toString();
    return `/admin/audit${qs ? `?${qs}` : ""}`;
  };

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Every mutating operation in your organization, newest first. 5-year default retention."
      />
      <div className="space-y-4 p-6">
        {/* Filters */}
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
          <button
            type="submit"
            className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm font-medium hover:opacity-90"
          >
            Filter
          </button>
          {(params.table || params.op) && (
            <Link
              href="/admin/audit"
              className="text-muted-foreground hover:text-foreground text-xs underline"
            >
              Clear
            </Link>
          )}
        </form>

        {/* Entries */}
        <section className="border-border bg-background overflow-hidden rounded-xl border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface text-muted-foreground border-border border-b text-xs uppercase">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">When</th>
                  <th className="px-4 py-2.5 text-left font-medium">Actor</th>
                  <th className="px-4 py-2.5 text-left font-medium">Operation</th>
                  <th className="px-4 py-2.5 text-left font-medium">Table</th>
                  <th className="px-4 py-2.5 text-left font-medium">Record</th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {entries.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="text-muted-foreground p-8 text-center text-sm italic"
                    >
                      No matching entries.
                    </td>
                  </tr>
                ) : (
                  entries.map((e) => (
                    <tr key={e.id} className="hover:bg-surface align-top">
                      <td className="text-foreground whitespace-nowrap px-4 py-2 tabular-nums">
                        {e.occurred_at.replace("T", " ").slice(0, 19)}
                      </td>
                      <td className="text-muted-foreground px-4 py-2 font-mono text-xs">
                        {e.actor_id ? e.actor_id.slice(0, 8) : <em>system</em>}
                      </td>
                      <td className="text-foreground px-4 py-2">{e.operation}</td>
                      <td className="text-muted-foreground px-4 py-2 font-mono text-xs">
                        {e.table_name}
                      </td>
                      <td className="text-muted-foreground px-4 py-2 font-mono text-xs">
                        {e.record_id.slice(0, 8)}
                      </td>
                    </tr>
                  ))
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
    </div>
  );
}
