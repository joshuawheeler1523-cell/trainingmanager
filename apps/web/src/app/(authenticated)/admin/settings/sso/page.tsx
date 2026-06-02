import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { isManager } from "@/lib/auth/role";
import SsoConfigList from "./sso-config-list";

export default async function SsoSettingsPage() {
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

  const { data: configs } = await supabase
    .from("sso_configs")
    .select("id, email_domain, display_name, supabase_provider_id, enabled, created_at")
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
        <h1 className="text-foreground mt-2 text-2xl font-bold">Single sign-on</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Let users sign in with your existing identity provider (AzureAD, Okta, Google Workspace,
          etc.). Once enabled for an email domain, anyone signing in with an address at that domain
          is redirected to your IdP — no Arbor passwords stored on your end.
        </p>
      </div>

      <div className="border-info-bd bg-info-bg rounded-lg border p-4 text-sm">
        <p className="text-info font-semibold">Setup steps</p>
        <ol className="text-info mt-2 list-inside list-decimal space-y-1 text-xs">
          <li>
            In your IdP, create a SAML 2.0 application. Set ACS URL to{" "}
            <code>https://your-arbor-host/auth/v1/sso/saml/acs</code> and entity id to your Arbor
            host.
          </li>
          <li>
            Send the SAML metadata XML to <code>support@arbor.app</code>. Arbor support registers
            the provider via <code>supabase.auth.admin.sso.providers.create()</code> and gives you
            the resulting provider id.
          </li>
          <li>
            Paste the provider id below + your email domain (e.g. <code>mercy-health.com</code>).
          </li>
          <li>Test sign-in with a user at that domain. Toggle Enabled when ready to cut over.</li>
        </ol>
      </div>

      <SsoConfigList configs={configs ?? []} />
    </div>
  );
}
