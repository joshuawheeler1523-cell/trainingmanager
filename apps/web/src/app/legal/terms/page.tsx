import LegalShell from "@/components/legal/legal-shell";
import { LEGAL_VERSIONS, PROVIDER_IDENTITY } from "@/lib/legal/versions";

export const metadata = { title: "Terms of Service — Arbor" };

export default function TermsPage() {
  const v = LEGAL_VERSIONS.terms;
  return (
    <LegalShell title="Terms of Service" version={v} effectiveDate={v}>
      <p>
        These Terms of Service (&quot;<strong>Terms</strong>&quot;) form a binding contract between{" "}
        {PROVIDER_IDENTITY.legalName}, a {PROVIDER_IDENTITY.jurisdiction} entity (&quot;
        <strong>Provider</strong>&quot;, &quot;<strong>we</strong>&quot;, &quot;
        <strong>us</strong>&quot;), and the legal entity that signs up for, is invited into, or
        otherwise uses the {PROVIDER_IDENTITY.tradeName} platform (&quot;
        <strong>Customer</strong>&quot;, &quot;<strong>you</strong>&quot;).
      </p>
      <p>
        By creating an account, accepting an invitation, calling the API with an issued key, or
        using the Service in any other capacity, you agree to these Terms on behalf of yourself and
        any organization you represent. If you do not have authority to bind your organization, do
        not use the Service.
      </p>

      <h2>1. Definitions</h2>
      <ul>
        <li>
          <strong>&quot;Service&quot;</strong> means the {PROVIDER_IDENTITY.tradeName} hosted
          software platform (web application at{" "}
          <code>app.{PROVIDER_IDENTITY.tradeName.toLowerCase()}.app</code> and any agency-served
          custom domain), the REST API at <code>/api/v1</code>, outbound webhooks, and all
          documentation, runbooks, and related services we provide.
        </li>
        <li>
          <strong>&quot;Authorized User&quot;</strong> means an individual you have invited and
          provisioned with a role (manager, instructor, viewer, agency_admin, or agency_member) in
          the Service.
        </li>
        <li>
          <strong>&quot;Customer Data&quot;</strong> means all data, content, and information you or
          your Authorized Users submit to the Service — including instructor records, classes,
          training records, projects, tasks, allocations, and any files uploaded.
        </li>
        <li>
          <strong>&quot;Agency&quot;</strong> means a consulting firm that resells the Service to
          its own end-customer organizations (&quot;<strong>Client Orgs</strong>&quot;) under our
          white-label program.
        </li>
        <li>
          <strong>&quot;Order&quot;</strong> means an executed order form, signed quote, or other
          written agreement between you and Provider that references these Terms and specifies your
          subscription tier, term, and fees.
        </li>
      </ul>

      <h2>2. Account, Access, and Security</h2>
      <p>
        You must (a) provide accurate signup information, (b) keep credentials confidential, (c) be
        responsible for all activity under your account and your Authorized Users&apos; accounts,
        and (d) notify us promptly at{" "}
        <a href={`mailto:${PROVIDER_IDENTITY.securityEmail}`}>{PROVIDER_IDENTITY.securityEmail}</a>{" "}
        of any unauthorized access. The Service supports email + password sign-in, magic-link
        sign-in, and SAML SSO; you may enforce SSO for your Authorized Users via the per-org SSO
        configuration.
      </p>

      <h2>3. License Grant and Restrictions</h2>
      <p>
        Subject to these Terms and any Order, we grant you a non-exclusive, non-transferable,
        revocable license to access and use the Service during the subscription term solely for your
        internal business purposes. You will not, and will not permit any third party to:
      </p>
      <ul>
        <li>reverse-engineer, decompile, or derive source code from the Service;</li>
        <li>
          use the Service to build a competing product, train machine-learning models intended to
          replicate it, or benchmark it without our prior written consent;
        </li>
        <li>
          remove proprietary notices, falsify HMAC signatures on outbound webhook payloads, or
          tamper with rate-limit / throttle controls;
        </li>
        <li>
          upload Customer Data you don&apos;t have the right to upload, or use the Service to
          process data subject to laws or regulations not contemplated by these Terms (see also the
          Acceptable Use Policy and BAA).
        </li>
      </ul>

      <h2>4. Customer Data and Ownership</h2>
      <p>
        As between the parties, you own all Customer Data. You grant Provider a limited license to
        host, copy, transmit, display, and process Customer Data solely as needed to provide the
        Service, comply with law, and (in aggregated, de-identified form) improve the Service.
      </p>
      <p>
        We process Customer Data as your processor under the Data Processing Addendum at{" "}
        <a href="/legal/dpa">/legal/dpa</a>, which is incorporated into these Terms by reference.
        For Customer Data subject to HIPAA, the parties&apos; obligations are governed by the
        executed Business Associate Agreement at <a href="/legal/baa">/legal/baa</a>.
      </p>

      <h2>5. Fees, Billing, and Taxes</h2>
      <p>
        Fees are set out in the applicable Order. The Service is currently invoiced manually (no
        Stripe or other automated card processor) — invoices are issued via the in-app billing
        console and emailed to your billing contact in PDF form. Payment terms default to Net 30
        from invoice date unless an Order states otherwise. Late amounts accrue interest at the
        lesser of 1.5% per month or the maximum allowed by law. Fees exclude taxes, which are your
        responsibility.
      </p>

      <h2>6. Term, Renewal, and Termination</h2>
      <p>
        These Terms remain in force while you have an active account. Subscription terms are set in
        the applicable Order. Either party may terminate for material breach uncured 30 days after
        written notice; we may suspend the Service immediately if your use violates the Acceptable
        Use Policy or threatens platform integrity.
      </p>
      <p>
        On termination: (a) we will make Customer Data available for export via the in-app data
        export at <code>/admin/data-export</code> for 30 days, after which we may delete it; (b) all
        license rights to the Service end; (c) outstanding fees accrued through termination remain
        payable.
      </p>

      <h2>7. Service Levels</h2>
      <p>
        Uptime, support response times, and remedies for falling short are governed by the Service
        Level Agreement at <a href="/legal/sla">/legal/sla</a>.
      </p>

      <h2>8. Confidentiality</h2>
      <p>
        Each party will protect the other&apos;s Confidential Information using at least the
        standard of care it uses to protect its own confidential information of like kind, and not
        less than reasonable care. This obligation survives termination. Customer Data is your
        Confidential Information; the Service&apos;s code, architecture, security controls, and
        non-public roadmaps are ours.
      </p>

      <h2>9. Warranties and Disclaimers</h2>
      <p>
        We warrant that the Service will materially conform to its published documentation and that
        we have implemented reasonable administrative, physical, and technical safeguards designed
        to protect Customer Data. EXCEPT FOR THE FOREGOING, THE SERVICE IS PROVIDED &quot;AS
        IS&quot; AND &quot;AS AVAILABLE&quot;. WE DISCLAIM ALL OTHER WARRANTIES, EXPRESS OR IMPLIED,
        INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
        NON-INFRINGEMENT.
      </p>

      <h2>10. Limitation of Liability</h2>
      <p>
        EXCEPT FOR EITHER PARTY&apos;S BREACH OF CONFIDENTIALITY, INDEMNIFICATION OBLIGATIONS,
        WILLFUL MISCONDUCT, OR PAYMENT OBLIGATIONS, NEITHER PARTY WILL BE LIABLE FOR INDIRECT,
        INCIDENTAL, CONSEQUENTIAL, SPECIAL, OR PUNITIVE DAMAGES. EACH PARTY&apos;S TOTAL AGGREGATE
        LIABILITY UNDER THESE TERMS WILL NOT EXCEED THE FEES YOU PAID TO US IN THE TWELVE MONTHS
        IMMEDIATELY PRECEDING THE EVENT GIVING RISE TO THE CLAIM.
      </p>

      <h2>11. Indemnification</h2>
      <p>
        You will defend, indemnify, and hold harmless Provider against any third-party claim arising
        from (a) your or your Authorized Users&apos; misuse of the Service, (b) Customer Data
        infringing a third party&apos;s rights, or (c) your violation of law. We will defend,
        indemnify, and hold harmless you against any third-party claim that the Service as provided
        infringes a US patent, copyright, or trademark.
      </p>

      <h2>12. Governing Law and Disputes</h2>
      <p>
        These Terms are governed by the laws of {PROVIDER_IDENTITY.jurisdiction}, without regard to
        conflict-of-law principles. The parties consent to the exclusive jurisdiction of the federal
        and state courts located in {PROVIDER_IDENTITY.jurisdiction}. Each party waives any right to
        a jury trial. UN Convention on Contracts for the International Sale of Goods does not apply.
      </p>

      <h2>13. Changes to These Terms</h2>
      <p>
        We may revise these Terms by posting an updated version and changing the version date at the
        top. Material changes will be announced by email or in-product notice at least 30 days
        before they take effect. Continued use after the effective date constitutes acceptance.
      </p>

      <h2>14. General</h2>
      <p>
        These Terms (including the documents referenced) are the entire agreement between the
        parties on this subject and supersede prior or contemporaneous understandings. If any
        provision is held unenforceable, the remainder remains in effect. Neither party may assign
        without the other&apos;s consent, except in connection with a merger, acquisition, or sale
        of substantially all assets. Notices to Provider should be sent to{" "}
        <a href={`mailto:${PROVIDER_IDENTITY.legalEmail}`}>{PROVIDER_IDENTITY.legalEmail}</a> or to
        the Provider address: {PROVIDER_IDENTITY.address}.
      </p>
    </LegalShell>
  );
}
