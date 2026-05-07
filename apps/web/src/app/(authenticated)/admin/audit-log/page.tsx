import { Suspense } from "react";
import PageHeader from "@/components/ui/page-header";
import OrgAdminGuard from "@/components/org-admin-guard";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import AuditLogFilters from "./audit-log-filters";
import AuditLogTable from "./audit-log-table";
import Pagination from "./pagination";

const PAGE_SIZE = 50;

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

async function AuditLogContent({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;

  const page = Math.max(1, Number(sp["page"] ?? 1));
  const fromDate = typeof sp["from"] === "string" ? sp["from"] : undefined;
  const toDate = typeof sp["to"] === "string" ? sp["to"] : undefined;
  const userId = typeof sp["user"] === "string" ? sp["user"] : undefined;
  const tables = typeof sp["tables"] === "string" ? sp["tables"].split(",").filter(Boolean) : [];
  const ops = typeof sp["op"] === "string" ? sp["op"].split(",").filter(Boolean) : [];

  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) return null;

  // Fetch members for filter dropdown and actor name resolution
  const { data: memberships } = await supabase
    .from("org_memberships")
    .select("user_id, display_name")
    .eq("org_id", orgId)
    .not("accepted_at", "is", null);

  const members = (memberships ?? []).map((m) => ({
    userId: m.user_id,
    displayName: m.display_name ?? m.user_id.slice(0, 8) + "…",
  }));

  // Fetch distinct table names seen in this org's audit log
  const { data: tableRows } = await supabase
    .from("audit_log")
    .select("table_name")
    .eq("org_id", orgId);

  const tableNames = Array.from(new Set((tableRows ?? []).map((r) => r.table_name)))
    .sort()
    .map((name) => ({ name }));

  // Build filtered query
  let query = supabase
    .from("audit_log")
    .select("*", { count: "exact" })
    .eq("org_id", orgId)
    .order("occurred_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (fromDate) query = query.gte("occurred_at", fromDate);
  if (toDate) query = query.lte("occurred_at", toDate + "T23:59:59.999Z");

  if (userId === "system") {
    query = query.is("actor_id", null);
  } else if (userId) {
    query = query.eq("actor_id", userId);
  }

  if (tables.length) query = query.in("table_name", tables);
  if (ops.length) query = query.in("operation", ops);

  const { data: rows, count } = await query;

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <AuditLogFilters members={members} tableNames={tableNames} />
      <p className="text-muted-foreground text-xs">
        {count ?? 0} {(count ?? 0) === 1 ? "entry" : "entries"}
      </p>
      <AuditLogTable rows={rows ?? []} members={members} />
      <Pagination page={page} totalPages={totalPages} />
    </div>
  );
}

export default function AuditLogPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <OrgAdminGuard>
      <div>
        <PageHeader
          title="Audit Log"
          description="A record of every change made to your organization's data."
        />
        <div className="p-6">
          <Suspense fallback={<div className="bg-surface h-64 animate-pulse rounded-lg" />}>
            <AuditLogContent searchParams={searchParams} />
          </Suspense>
        </div>
      </div>
    </OrgAdminGuard>
  );
}
