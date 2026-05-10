import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { isManager } from "@/lib/auth/role";
import WebhooksManager from "./webhooks-manager";

export default async function WebhooksSettingsPage() {
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

  const [{ data: endpoints }, { data: deliveries }] = await Promise.all([
    supabase
      .from("webhook_endpoints")
      .select("id, url, events, signing_secret, enabled, description, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false }),
    supabase
      .from("webhook_deliveries")
      .select(
        "id, endpoint_id, event_type, status, response_code, attempts, created_at, delivered_at",
      )
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <Link
          href="/admin/settings"
          className="text-muted-foreground hover:text-foreground text-xs"
        >
          ← Back to settings
        </Link>
        <h1 className="text-foreground mt-2 text-2xl font-bold">Webhooks</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Receive HTTPS callbacks when events happen in your org. Each payload is signed with HMAC
          SHA-256 in the <code>X-Arbor-Signature</code> header (format:{" "}
          <code>t=&lt;unix&gt;,sig=&lt;hex&gt;</code>); compute{" "}
          <code>
            HMAC(secret, &quot;${"{"}t{"}"}.${"{"}rawBody{"}"}&quot;)
          </code>{" "}
          on your end and compare.
        </p>
      </div>

      <WebhooksManager endpoints={endpoints ?? []} deliveries={deliveries ?? []} />
    </div>
  );
}
