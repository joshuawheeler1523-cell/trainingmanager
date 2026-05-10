import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { isManager } from "@/lib/auth/role";
import ApiKeysList from "./api-keys-list";

export default async function ApiSettingsPage() {
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

  const { data: keys } = await supabase
    .from("api_keys")
    .select("id, name, key_prefix, created_at, last_used_at, revoked_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <Link
          href="/admin/settings"
          className="text-muted-foreground hover:text-foreground text-xs"
        >
          ← Back to settings
        </Link>
        <h1 className="text-foreground mt-2 text-2xl font-bold">API keys</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Bearer tokens for the Arbor REST API. Pass as{" "}
          <code>Authorization: Bearer arbor_live_...</code> when calling <code>/api/v1/*</code>.
          Each key is scoped to this organization.
        </p>
      </div>

      <ApiKeysList keys={keys ?? []} />

      <section className="border-border bg-background space-y-3 rounded-xl border p-5 text-sm">
        <h2 className="text-foreground text-base font-bold">v1 endpoints</h2>
        <ul className="text-muted-foreground space-y-1 font-mono text-xs">
          <li>GET /api/v1/instructors</li>
          <li>GET /api/v1/classes</li>
          <li>GET /api/v1/tras</li>
        </ul>
        <p className="text-muted-foreground text-xs">
          All endpoints support cursor pagination via <code>?limit=50&amp;cursor=...</code>. Errors
          follow RFC 7807 problem-details. Rate limit: 100 req/min per key.
        </p>
      </section>
    </div>
  );
}
