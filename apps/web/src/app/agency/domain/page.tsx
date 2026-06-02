import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgencyId } from "@/lib/auth/agency";
import { dnsInstructionsFor } from "@/lib/vercel-domains";
import DomainForm from "./domain-form";

export default async function AgencyDomainPage() {
  const supabase = await createClient();
  const agencyId = await getCurrentAgencyId();
  if (!agencyId) return null;

  const { data: agency } = await supabase
    .from("agencies")
    .select(
      "id, custom_domain, custom_domain_pending, custom_domain_verification_token, custom_domain_verified_at",
    )
    .eq("id", agencyId)
    .maybeSingle();
  if (!agency) return null;

  const apiConfigured = Boolean(
    process.env["VERCEL_API_TOKEN"] && process.env["VERCEL_PROJECT_ID"],
  );

  const activeDomain = agency.custom_domain;
  const pendingDomain = agency.custom_domain_pending;
  const verificationToken = agency.custom_domain_verification_token;
  const verifiedAt = agency.custom_domain_verified_at;
  const dnsRecords = pendingDomain
    ? dnsInstructionsFor(pendingDomain)
    : activeDomain
      ? dnsInstructionsFor(activeDomain)
      : [];

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <Link href="/agency" className="text-muted-foreground hover:text-foreground text-xs">
          ← Back to dashboard
        </Link>
        <h1 className="text-foreground mt-2 text-2xl font-bold">Custom domain</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Serve Arbor under your own hostname (e.g. <code>app.your-firm.com</code>). Your client
          orgs sign in at this domain instead of arbor.app, and the login page picks up your
          branding automatically.
        </p>
      </div>

      {!apiConfigured && (
        <div className="border-warning-bd bg-warning-bg rounded-lg border p-4 text-sm">
          <p className="text-warning font-semibold">Vercel API not configured</p>
          <p className="text-warning mt-1 text-xs">
            Set <code>VERCEL_API_TOKEN</code> and <code>VERCEL_PROJECT_ID</code> in the deployment
            environment for domain verification to work end-to-end. Domains can still be saved
            below; verification will fail until the env vars are set.
          </p>
        </div>
      )}

      {/* Current state */}
      <section className="border-border bg-background space-y-3 rounded-xl border p-5">
        <h2 className="text-foreground text-base font-bold">Status</h2>
        {activeDomain ? (
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-success inline-block h-2 w-2 rounded-full" />
              <span className="text-foreground font-mono text-sm">{activeDomain}</span>
              <span className="text-success text-xs font-medium">✓ Verified</span>
            </div>
            {verifiedAt && (
              <p className="text-muted-foreground mt-1 text-xs">
                Verified {verifiedAt.slice(0, 10)}
              </p>
            )}
          </div>
        ) : pendingDomain ? (
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-warning inline-block h-2 w-2 rounded-full" />
              <span className="text-foreground font-mono text-sm">{pendingDomain}</span>
              <span className="text-warning text-xs font-medium">Awaiting DNS verification</span>
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              Configure the DNS records below, then click Verify.
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm italic">No custom domain configured.</p>
        )}
      </section>

      {/* DNS instructions */}
      {dnsRecords.length > 0 && (
        <section className="border-border bg-background space-y-3 rounded-xl border p-5">
          <h2 className="text-foreground text-base font-bold">DNS records</h2>
          <p className="text-muted-foreground text-xs">
            Add these to your DNS provider (e.g. Cloudflare, Route 53, Namecheap). Pick the record
            that matches your domain shape.
          </p>
          <div className="border-border overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-surface text-muted-foreground border-border border-b text-xs uppercase">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Type</th>
                  <th className="px-3 py-2 text-left font-medium">Host</th>
                  <th className="px-3 py-2 text-left font-medium">Value</th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {dnsRecords.map((r, i) => (
                  <tr key={`${r.recordType}-${i.toString()}`}>
                    <td className="text-foreground px-3 py-2 font-mono">{r.recordType}</td>
                    <td className="text-foreground px-3 py-2 font-mono">{r.host}</td>
                    <td className="text-foreground px-3 py-2 font-mono">{r.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {verificationToken && (
            <div className="border-border bg-surface rounded-md border p-3">
              <p className="text-muted-foreground mb-1 text-xs font-semibold uppercase">
                TXT verification record
              </p>
              <p className="text-foreground break-all font-mono text-xs">{verificationToken}</p>
              <p className="text-muted-foreground mt-1 text-xs">
                Add this as a TXT record on the same hostname to prove ownership.
              </p>
            </div>
          )}
        </section>
      )}

      {/* Form */}
      <DomainForm activeDomain={activeDomain} pendingDomain={pendingDomain} />
    </div>
  );
}
