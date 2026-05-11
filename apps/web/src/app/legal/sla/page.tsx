import LegalShell from "@/components/legal/legal-shell";
import { LEGAL_VERSIONS, PROVIDER_IDENTITY } from "@/lib/legal/versions";

export const metadata = { title: "Service Level Agreement — Arbor" };

export default function SlaPage() {
  const v = LEGAL_VERSIONS.sla;
  return (
    <LegalShell title="Service Level Agreement" version={v} effectiveDate={v}>
      <p>
        This Service Level Agreement (&quot;<strong>SLA</strong>&quot;) governs the availability and
        support commitments for paid subscriptions to the {PROVIDER_IDENTITY.tradeName} Service.
        Free-tier and trial accounts are provided on a best-effort basis without SLA.
      </p>

      <h2>1. Uptime commitment</h2>
      <p>
        We commit to a monthly uptime percentage of <strong>99.9%</strong> for the Service&apos;s
        production web application and REST API, measured per calendar month. Uptime is calculated
        as:
      </p>
      <p className="font-mono text-xs">
        Uptime% = (Total minutes − Unavailable minutes) ÷ Total minutes × 100
      </p>
      <p>
        &quot;<strong>Unavailable</strong>&quot; means the Service is returning 5xx responses to the
        majority of requests for a sustained period of more than 5 consecutive minutes, excluding
        the carve-outs in Section 3.
      </p>

      <h2>2. Service credits</h2>
      <p>
        If we fail to meet the uptime commitment in a given calendar month, you are eligible for a
        service credit applied to your next invoice:
      </p>
      <ul>
        <li>99.0% – 99.9%: 10% of the affected month&apos;s fees</li>
        <li>95.0% – 98.99%: 25% of the affected month&apos;s fees</li>
        <li>Below 95.0%: 50% of the affected month&apos;s fees</li>
      </ul>
      <p>
        Service credits are your sole and exclusive remedy for any failure to meet the uptime
        commitment. To claim a credit, email{" "}
        <a href={`mailto:${PROVIDER_IDENTITY.supportEmail}`}>{PROVIDER_IDENTITY.supportEmail}</a>{" "}
        within 30 days of the end of the affected month with the dates and approximate times of the
        unavailability. Credits do not entitle you to a refund and expire if the underlying
        agreement is terminated for cause by us.
      </p>

      <h2>3. Exclusions</h2>
      <p>The following are excluded from uptime calculation and do not qualify for credits:</p>
      <ul>
        <li>
          Scheduled maintenance announced at least 48 hours in advance via{" "}
          <a href="/trust">/trust</a> or status page;
        </li>
        <li>
          Downtime caused by your acts or omissions, including AUP violations, misconfigured custom
          domains, misconfigured SSO providers, or attacks against your tenant (DDoS, credential
          stuffing) that don&apos;t affect other tenants;
        </li>
        <li>
          Force majeure events (natural disasters, war, civil unrest, pandemic-related disruptions);
        </li>
        <li>
          Outages of upstream services beyond our reasonable control (Supabase, Vercel, Resend, DNS
          providers, customer-controlled IdP) that are not caused by Provider&apos;s negligence;
        </li>
        <li>Issues with Customer&apos;s internet connection or local network.</li>
      </ul>

      <h2>4. Support response times</h2>
      <p>
        Support is available via email at{" "}
        <a href={`mailto:${PROVIDER_IDENTITY.supportEmail}`}>{PROVIDER_IDENTITY.supportEmail}</a>{" "}
        Monday through Friday, 9 AM to 6 PM Eastern Time, excluding US federal holidays.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-border border-b text-left text-xs uppercase">
              <th className="py-2 pr-3">Severity</th>
              <th className="py-2 pr-3">Definition</th>
              <th className="py-2">Initial response</th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y align-top">
            <tr>
              <td className="py-3 pr-3 font-semibold">P1 — Critical</td>
              <td className="text-muted-foreground py-3 pr-3 text-xs">
                Service is fully unavailable or data is at risk
              </td>
              <td className="py-3 text-xs">Within 1 business hour</td>
            </tr>
            <tr>
              <td className="py-3 pr-3 font-semibold">P2 — High</td>
              <td className="text-muted-foreground py-3 pr-3 text-xs">
                Major feature broken, no workaround
              </td>
              <td className="py-3 text-xs">Within 4 business hours</td>
            </tr>
            <tr>
              <td className="py-3 pr-3 font-semibold">P3 — Normal</td>
              <td className="text-muted-foreground py-3 pr-3 text-xs">
                Minor feature issue or workaround available
              </td>
              <td className="py-3 text-xs">Within 1 business day</td>
            </tr>
            <tr>
              <td className="py-3 pr-3 font-semibold">P4 — Low</td>
              <td className="text-muted-foreground py-3 pr-3 text-xs">
                Cosmetic, documentation, feature requests
              </td>
              <td className="py-3 text-xs">Within 3 business days</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>5. Maintenance windows</h2>
      <p>
        Routine maintenance is performed without downtime where possible. When downtime is required,
        we will (a) schedule it during low-traffic windows (Saturdays 02:00–06:00 Eastern Time, or
        other times announced in advance), (b) provide at least 48 hours notice via the{" "}
        <a href="/trust">/trust</a> page or status page, and (c) limit total scheduled maintenance
        to no more than 4 hours per calendar month. Scheduled maintenance does not count against the
        uptime commitment.
      </p>

      <h2>6. Status page</h2>
      <p>
        Real-time service status is published at <a href="/trust">/trust</a> and our public status
        page. Subscribe to incident notifications by email by clicking <em>Subscribe</em> on the
        status page.
      </p>
    </LegalShell>
  );
}
