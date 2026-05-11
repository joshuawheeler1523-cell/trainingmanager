import LegalShell from "@/components/legal/legal-shell";
import { LEGAL_VERSIONS, PROVIDER_IDENTITY } from "@/lib/legal/versions";

export const metadata = { title: "Reseller / Agency Agreement — Arbor" };

export default function ResellerAgreementPage() {
  const v = LEGAL_VERSIONS.reseller;
  return (
    <LegalShell title="Reseller / Agency Agreement" version={v} effectiveDate={v}>
      <p>
        This Reseller / Agency Agreement (&quot;<strong>Agreement</strong>&quot;) governs the
        relationship between {PROVIDER_IDENTITY.legalName} (&quot;<strong>Provider</strong>&quot;)
        and any consulting or training organization (&quot;<strong>Agency</strong>&quot;) that signs
        up via <code>/agency-signup</code> or that Provider has otherwise admitted to its
        white-label program. By creating an agency account or accepting an invitation as
        agency_admin, you agree to this Agreement on behalf of the Agency.
      </p>

      <h2>1. Scope</h2>
      <p>
        Agency may resell access to the {PROVIDER_IDENTITY.tradeName} Service to its end-customer
        organizations (&quot;<strong>Client Orgs</strong>&quot;) under Agency&apos;s own brand
        (logo, colors, custom domain, email from-address) and pricing, subject to this Agreement and
        the Terms of Service that apply to every Client Org. Each Client Org accepts those Terms of
        Service directly (Agency cannot accept on their behalf).
      </p>

      <h2>2. Pricing and revenue share</h2>
      <p>
        Agency sets its own retail pricing to Client Orgs. Provider charges Agency a revenue share
        equal to thirty percent (30%) of the Annual Contract Value of every active Client Org
        contract Agency records in the Service, payable monthly in arrears via invoices Provider
        issues to Agency&apos;s billing contact. Agency may negotiate a different revenue share
        percentage for specific contracts, recorded as the <code>revenue_share_pct</code> field on
        the contract; that value overrides the default.
      </p>
      <p>
        Provider invoices in USD with Net 30 payment terms. Late amounts accrue interest at the
        lesser of 1.5% per month or the maximum allowed by law. Agency is solely responsible for
        collecting from Client Orgs; Provider has no direct relationship with Client Orgs for
        billing purposes (other than the underlying Terms of Service).
      </p>

      <h2>3. Tier framework</h2>
      <p>Provider&apos;s recommended retail pricing tiers, by Client Org Authorized User count:</p>
      <ul>
        <li>Small (under 25 users): ~$30,000 / year</li>
        <li>Medium (25–100 users): ~$50,000 / year</li>
        <li>Large (100–500 users): ~$75,000 / year</li>
        <li>Enterprise (500+ users): custom</li>
      </ul>
      <p>
        Agency may price below or above these guidelines. Provider&apos;s revenue share is
        calculated against the actual Annual Contract Value Agency records.
      </p>

      <h2>4. Branding rights</h2>
      <p>
        Provider grants Agency a non-exclusive, non-transferable, royalty-free license, during the
        term, to use Agency&apos;s own logo, color scheme, email from-address, and custom domain to
        present the Service to Client Orgs. Agency may use phrases like &quot;powered by Arbor&quot;
        in fine print but may not represent that Agency built the Service or owns the intellectual
        property.
      </p>

      <h2>5. Provisioning and support</h2>
      <p>
        Agency uses the agency console at <code>/agency</code> to provision Client Orgs and record
        contracts. Agency is responsible for first-line support to its Client Orgs; Provider
        provides second-line support to Agency on the schedule defined in the{" "}
        <a href="/legal/sla">SLA</a>.
      </p>
      <p>
        Agency_admin role does NOT automatically grant access to Customer Data inside any Client
        Org. To operate inside a Client Org, an individual must be granted an{" "}
        <code>org_membership</code> with an appropriate role (manager / instructor / viewer). This
        isolation is intentional and required.
      </p>

      <h2>6. Compliance and reporting</h2>
      <ul>
        <li>
          Agency must keep contract records (status, ACV, dates) accurate and current; Provider may
          audit Agency&apos;s contract records up to once per twelve-month period on reasonable
          notice.
        </li>
        <li>
          For any Client Org subject to HIPAA, Agency must ensure the executed BAA between Provider
          and that Client Org is in place before any PHI is transmitted to the Service. Agency
          assists Client Orgs in completing the BAA workflow at <code>/admin/legal/baa</code>.
        </li>
        <li>
          Agency will not use the Service in a manner that violates the{" "}
          <a href="/legal/aup">Acceptable Use Policy</a>, and will require its Client Orgs to
          comply.
        </li>
      </ul>

      <h2>7. Term and termination</h2>
      <p>
        This Agreement starts when Agency creates an agency account and continues until terminated.
        Either party may terminate for convenience on 90 days written notice; immediately for
        material breach uncured 30 days after written notice; immediately for the other party&apos;s
        insolvency, assignment for benefit of creditors, or filing under the Bankruptcy Code.
      </p>
      <p>
        On termination: (a) Provider will continue to host Client Orgs on Agency&apos;s domain for
        30 days, then redirect to {PROVIDER_IDENTITY.tradeName}&apos;s default domain; (b)
        Agency&apos;s rights under this Agreement end; (c) outstanding revenue share through
        termination remains payable; (d) Provider may, at its option, offer affected Client Orgs the
        chance to continue directly with Provider on equivalent terms.
      </p>

      <h2>8. Intellectual property</h2>
      <p>
        Provider retains all right, title, and interest in the Service, the platform code, the
        documentation, and all associated intellectual property. Agency retains all rights in
        Agency&apos;s own brand assets and any data Agency provides outside Customer Data.
      </p>

      <h2>9. Confidentiality, warranties, liability</h2>
      <p>
        Sections 8 (Confidentiality), 9 (Warranties and Disclaimers), 10 (Limitation of Liability),
        11 (Indemnification), and 12 (Governing Law) of the{" "}
        <a href="/legal/terms">Terms of Service</a> apply to this Agreement, replacing
        &quot;Customer&quot; with &quot;Agency&quot; where context requires.
      </p>

      <h2>10. Restrictions on Agency conduct</h2>
      <ul>
        <li>
          Agency must accurately report contract values; under-reporting is a material breach and
          may result in immediate termination plus a true-up audit.
        </li>
        <li>
          Agency may not represent itself as Provider, accept legal process on behalf of Provider,
          or modify the Terms of Service that apply to Client Orgs.
        </li>
        <li>
          Agency may not directly compete with Provider during the term and for twelve months after
          termination by building, contributing to, or operating a substantially similar
          training-operations platform.
        </li>
      </ul>

      <h2>11. Changes</h2>
      <p>
        Provider may revise this Agreement, including the default revenue share percentage, with 90
        days written notice. New terms apply to new Client Org contracts; existing contracts retain
        their original economics through their term.
      </p>
    </LegalShell>
  );
}
