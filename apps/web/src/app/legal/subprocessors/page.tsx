import LegalShell from "@/components/legal/legal-shell";
import { LEGAL_VERSIONS, PROVIDER_IDENTITY } from "@/lib/legal/versions";

export const metadata = { title: "Subprocessors — Arbor" };

const SUBPROCESSORS = [
  {
    name: "Supabase, Inc.",
    purpose: "Hosted Postgres database, authentication, file storage",
    dataAccessed:
      "All Customer Data; auth records (email, hashed password, MFA factors); audit log; storage objects",
    location: "United States (us-east-1 by default)",
    compliance: "SOC 2 Type II; HIPAA-eligible add-on; GDPR-aligned",
  },
  {
    name: "Vercel, Inc.",
    purpose: "Application hosting, edge network, custom-domain TLS",
    dataAccessed:
      "Request metadata (URL, IP, user-agent), runtime logs (no Customer Data persisted); domain DNS configuration",
    location: "United States (global edge)",
    compliance: "SOC 2 Type II; HIPAA-eligible add-on",
  },
  {
    name: "Resend, Inc.",
    purpose: "Transactional email delivery (invitations, notifications)",
    dataAccessed: "Recipient email address; email subject + HTML/text body",
    location: "United States",
    compliance: "SOC 2 Type II",
  },
  {
    name: "Drata, Inc.",
    purpose: "SOC 2 compliance automation and evidence collection",
    dataAccessed:
      "Read-only metadata from Vercel, Supabase, GitHub for evidence collection only — no Customer Data",
    location: "United States",
    compliance: "SOC 2 Type II",
  },
  {
    name: "GitHub, Inc.",
    purpose: "Source code hosting and CI/CD",
    dataAccessed: "Source code (no Customer Data)",
    location: "United States",
    compliance: "SOC 2 Type II",
  },
];

export default function SubprocessorsPage() {
  const v = LEGAL_VERSIONS.subprocessors;
  return (
    <LegalShell title="Subprocessors" version={v} effectiveDate={v}>
      <p>
        {PROVIDER_IDENTITY.legalName} engages the third parties listed below to help operate the{" "}
        {PROVIDER_IDENTITY.tradeName} Service. Each subprocessor is bound by written contract to
        protect Personal Data on terms no less protective than those in our{" "}
        <a href="/legal/dpa">Data Processing Addendum</a>. We will inform customers of any additions
        or replacements at least 30 days in advance.
      </p>

      <p>
        To receive notifications of subprocessor changes, email{" "}
        <a href={`mailto:${PROVIDER_IDENTITY.privacyEmail}`}>{PROVIDER_IDENTITY.privacyEmail}</a>{" "}
        with the subject line &quot;Subscribe — subprocessor updates&quot;.
      </p>

      <h2>Active subprocessors</h2>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-border border-b text-left text-xs uppercase">
              <th className="py-2 pr-3">Name</th>
              <th className="py-2 pr-3">Purpose</th>
              <th className="py-2 pr-3">Data accessed</th>
              <th className="py-2 pr-3">Location</th>
              <th className="py-2">Compliance</th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y align-top">
            {SUBPROCESSORS.map((s) => (
              <tr key={s.name}>
                <td className="text-foreground py-3 pr-3 font-medium">{s.name}</td>
                <td className="text-muted-foreground py-3 pr-3 text-xs">{s.purpose}</td>
                <td className="text-muted-foreground py-3 pr-3 text-xs">{s.dataAccessed}</td>
                <td className="text-muted-foreground py-3 pr-3 text-xs">{s.location}</td>
                <td className="text-muted-foreground py-3 text-xs">{s.compliance}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Notification of changes</h2>
      <p>
        At least 30 days before adding or replacing a subprocessor that processes Customer Data, we
        will (a) update this page, (b) email the change to billing/admin contacts on every active
        organization, and (c) email subscribers per above. Customers may object on reasonable
        data-protection grounds within 14 days of notice; if the objection cannot be resolved, the
        customer may terminate the affected portion of the Service for convenience.
      </p>

      <h2>Last updated</h2>
      <p>{v}</p>
    </LegalShell>
  );
}
