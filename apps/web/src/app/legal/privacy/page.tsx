import LegalShell from "@/components/legal/legal-shell";
import { LEGAL_VERSIONS, PROVIDER_IDENTITY } from "@/lib/legal/versions";

export const metadata = { title: "Privacy Policy — Arbor" };

export default function PrivacyPage() {
  const v = LEGAL_VERSIONS.privacy;
  return (
    <LegalShell title="Privacy Policy" version={v} effectiveDate={v}>
      <p>
        This Privacy Policy describes how {PROVIDER_IDENTITY.legalName} (&quot;
        {PROVIDER_IDENTITY.tradeName}&quot;, &quot;we&quot;, &quot;us&quot;) collects, uses, and
        shares personal information when you visit our website, sign up for an account, use the
        Arbor application, or interact with us in any other way.
      </p>
      <p>
        For Customer Data we process on behalf of an organization (e.g. instructor records, training
        records uploaded by your hospital&apos;s training department), we act as a{" "}
        <strong>processor</strong> under that organization&apos;s instructions, governed by the{" "}
        <a href="/legal/dpa">Data Processing Addendum</a>. This Policy primarily describes the
        personal information we collect as a <strong>controller</strong> — for example, your email
        address when you create an account, or analytics about how you use our marketing site.
      </p>

      <h2>1. Information we collect</h2>
      <h3>1.1 Information you give us</h3>
      <ul>
        <li>
          <strong>Account information:</strong> name, email address, password (hashed via Supabase
          Auth&apos;s bcrypt), profile photo if provided, phone number if provided.
        </li>
        <li>
          <strong>Organization details:</strong> organization name, slug, role (manager, instructor,
          viewer, agency_admin), workspace preset, and (for agencies) billing contact, bill-to
          address, payment terms.
        </li>
        <li>
          <strong>Communications:</strong> messages you send via support, sales inquiries, replies
          to invitation emails, and similar.
        </li>
        <li>
          <strong>Customer Data you upload:</strong> instructor records, classes, training records,
          project plans, allocations, files. As described above we process these as a processor on
          your organization&apos;s behalf.
        </li>
      </ul>

      <h3>1.2 Information we collect automatically</h3>
      <ul>
        <li>
          <strong>Device and usage:</strong> IP address, browser type and version, operating system,
          timestamps, pages visited within the Service, features used. Captured via Vercel edge logs
          and our application&apos;s <code>audit_log</code> table.
        </li>
        <li>
          <strong>Cookies:</strong> session cookies (necessary for authentication), preference
          cookies, and — only with your consent — analytics cookies. See the{" "}
          <a href="/legal/cookies">Cookie Policy</a>.
        </li>
      </ul>

      <h3>1.3 Information from third parties</h3>
      <p>
        If you sign in via SSO, we receive identity attributes (email, name) from your
        organization&apos;s identity provider (e.g. AzureAD, Okta, Google Workspace). If your
        organization is provisioned by a reseller agency, we receive your initial role and
        membership from that agency.
      </p>

      <h2>2. How we use information</h2>
      <ul>
        <li>To provide, maintain, and improve the Service.</li>
        <li>To authenticate users, gate access to organizational resources, and enforce roles.</li>
        <li>To send transactional email (invitations, password resets, billing) via Resend.</li>
        <li>To respond to support requests and communicate about your account.</li>
        <li>
          To detect, prevent, and respond to security incidents, abuse, and violations of the
          Acceptable Use Policy.
        </li>
        <li>To comply with legal obligations and enforce our agreements.</li>
        <li>
          With your consent, for analytics that help us understand product usage and improve UX.
        </li>
      </ul>

      <h2>3. Legal bases for processing (GDPR)</h2>
      <p>
        For users in the European Economic Area, United Kingdom, or Switzerland, our legal bases
        are: (a) <strong>contract</strong> — to provide the Service you signed up for; (b){" "}
        <strong>legitimate interests</strong> — to operate, secure, and improve the Service; (c){" "}
        <strong>consent</strong> — for non-essential cookies and any marketing communications; (d){" "}
        <strong>legal obligation</strong> — when required to comply with applicable law.
      </p>

      <h2>4. How we share information</h2>
      <p>We do not sell personal information. We share it only with:</p>
      <ul>
        <li>
          <strong>Subprocessors</strong> that help us operate the Service (Supabase, Vercel, Resend,
          Drata, GitHub). The full list and what each receives is at{" "}
          <a href="/legal/subprocessors">/legal/subprocessors</a>. All subprocessors are bound by
          contract to protect personal information.
        </li>
        <li>
          <strong>Within your organization:</strong> data uploaded by one Authorized User is visible
          to other Authorized Users in the same organization based on their role.
        </li>
        <li>
          <strong>To your reseller agency,</strong> if your organization is a Client Org under an
          agency: the agency_admin can see your organization name, seat counts, and billing-related
          metadata. They cannot see Customer Data inside your organization unless explicitly added
          as a manager.
        </li>
        <li>
          <strong>For legal reasons:</strong> when we believe in good faith disclosure is required
          by law, valid legal process, or to protect rights, property, or safety.
        </li>
        <li>
          <strong>In a business transaction:</strong> in connection with a merger, acquisition, or
          sale of assets, with notice to you and your right to object where required by law.
        </li>
      </ul>

      <h2>5. International transfers</h2>
      <p>
        Customer Data and personal information are stored in Supabase&apos;s and Vercel&apos;s US
        infrastructure regions by default. If you are in the EEA / UK / Switzerland, your data may
        be transferred to the United States. Where required, transfers rely on the EU Standard
        Contractual Clauses (incorporated by reference in our DPA) and applicable supplementary
        measures.
      </p>

      <h2>6. Data retention</h2>
      <p>
        Customer Data is retained for the duration of your account plus 30 days post-termination
        (during which you can export). Audit log entries default to 5 years (configurable
        per-organization to a minimum of 30 days). Account-level personal information is retained
        while the account is active and for a reasonable period thereafter to satisfy legal,
        accounting, or reporting requirements.
      </p>

      <h2>7. Your rights</h2>
      <p>
        Depending on your location, you may have the right to access, correct, delete, restrict, or
        port your personal information; to object to processing; and to withdraw consent. To
        exercise any of these rights, contact{" "}
        <a href={`mailto:${PROVIDER_IDENTITY.privacyEmail}`}>{PROVIDER_IDENTITY.privacyEmail}</a>.
        We will respond within the period required by applicable law (typically 30 days). You also
        have the right to lodge a complaint with your local data protection authority.
      </p>
      <p>
        Where we process personal information as a processor on behalf of your organization (e.g.
        records inside your training database), please direct rights requests to your
        organization&apos;s administrator first; we will assist them in fulfilling your request.
      </p>

      <h2>8. Children</h2>
      <p>
        The Service is not directed to children under 16. We do not knowingly collect personal
        information from children. If you believe we have, contact{" "}
        <a href={`mailto:${PROVIDER_IDENTITY.privacyEmail}`}>{PROVIDER_IDENTITY.privacyEmail}</a>.
      </p>

      <h2>9. Security</h2>
      <p>
        We maintain administrative, physical, and technical safeguards designed to protect personal
        information against accidental or unlawful destruction, loss, alteration, and unauthorized
        disclosure. Highlights: encryption in transit (TLS 1.2+) and at rest (Supabase managed
        encryption), Row-Level Security on every tenant table, audit logging, SAML SSO support,
        custom-domain TLS via Vercel, dependency scanning via GitHub Dependabot, and a documented
        incident-response runbook. Our SOC 2 Type II program is managed via Drata.
      </p>

      <h2>10. Contact</h2>
      <p>
        For privacy questions, requests, or complaints, contact our privacy team at{" "}
        <a href={`mailto:${PROVIDER_IDENTITY.privacyEmail}`}>{PROVIDER_IDENTITY.privacyEmail}</a> or
        our data protection officer at{" "}
        <a href={`mailto:${PROVIDER_IDENTITY.dpoEmail}`}>{PROVIDER_IDENTITY.dpoEmail}</a>. Postal:{" "}
        {PROVIDER_IDENTITY.address}.
      </p>

      <h2>11. Changes</h2>
      <p>
        We will notify you of material changes by email or in-product notice at least 30 days before
        they take effect, and will update the version date at the top of this page.
      </p>
    </LegalShell>
  );
}
