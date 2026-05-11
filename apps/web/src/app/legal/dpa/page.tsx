import LegalShell from "@/components/legal/legal-shell";
import { LEGAL_VERSIONS, PROVIDER_IDENTITY } from "@/lib/legal/versions";

export const metadata = { title: "Data Processing Addendum — Arbor" };

export default function DpaPage() {
  const v = LEGAL_VERSIONS.dpa;
  return (
    <LegalShell title="Data Processing Addendum" version={v} effectiveDate={v}>
      <p>
        This Data Processing Addendum (&quot;<strong>DPA</strong>&quot;) forms part of the agreement
        between Customer (&quot;<strong>Controller</strong>&quot;) and {PROVIDER_IDENTITY.legalName}{" "}
        (&quot;<strong>Processor</strong>&quot;) for use of the {PROVIDER_IDENTITY.tradeName}{" "}
        Service. It applies to any processing of Personal Data subject to GDPR, UK GDPR, the Swiss
        FADP, or the CCPA / CPRA.
      </p>

      <h2>1. Definitions</h2>
      <p>
        Capitalized terms not defined here have the meaning given in the GDPR (Regulation (EU)
        2016/679). &quot;<strong>Customer Data</strong>&quot; means Personal Data submitted to the
        Service by Controller or its Authorized Users. &quot;<strong>Subprocessor</strong>
        &quot; means a third party engaged by Processor to process Customer Data.
      </p>

      <h2>2. Subject matter and details of processing</h2>
      <ul>
        <li>
          <strong>Subject matter:</strong> Provider&apos;s provision of the Service.
        </li>
        <li>
          <strong>Duration:</strong> the term of the underlying agreement plus the data retention
          period set out in the Privacy Policy.
        </li>
        <li>
          <strong>Nature and purpose:</strong> hosting, organizing, retrieving, and presenting
          training operations data (instructors, classes, training records, projects, tasks,
          allocations) so Controller&apos;s Authorized Users can manage their training programs.
        </li>
        <li>
          <strong>Categories of data subjects:</strong> Controller&apos;s employees, contractors,
          trainees, and other individuals whose data Controller chooses to upload.
        </li>
        <li>
          <strong>Categories of Personal Data:</strong> name, email address, role/title, department,
          training history, certifications, and any additional data Controller chooses to upload
          (e.g. notes, tags). For HIPAA-covered customers this may include Protected Health
          Information governed by the BAA.
        </li>
      </ul>

      <h2>3. Processor obligations</h2>
      <p>Processor will:</p>
      <ul>
        <li>
          process Customer Data only on Controller&apos;s documented instructions, including
          transfers to a third country, unless required to do otherwise by applicable law;
        </li>
        <li>
          ensure persons authorized to process Customer Data have committed themselves to
          confidentiality or are under an appropriate statutory obligation;
        </li>
        <li>
          implement and maintain the technical and organizational security measures set out in Annex
          A;
        </li>
        <li>
          assist Controller, taking into account the nature of the processing, in fulfilling
          requests from data subjects exercising their rights;
        </li>
        <li>
          notify Controller without undue delay (and in any case within 72 hours of awareness) after
          becoming aware of a Personal Data Breach affecting Customer Data;
        </li>
        <li>
          make available to Controller all information necessary to demonstrate compliance with this
          DPA and allow for audits as set out in Section 7.
        </li>
      </ul>

      <h2>4. Subprocessors</h2>
      <p>
        Controller authorizes Processor to engage the subprocessors listed at{" "}
        <a href="/legal/subprocessors">/legal/subprocessors</a>. Processor will inform Controller of
        any intended changes to that list (additions or replacements) at least 30 days in advance
        via email to the Controller&apos;s designated billing or admin contact, giving Controller
        the opportunity to object on reasonable grounds related to data protection.
      </p>

      <h2>5. International transfers</h2>
      <p>
        Where Customer Data is transferred from the EEA, UK, or Switzerland to a country not deemed
        adequate by the European Commission (or equivalent UK/Swiss authority), the parties agree
        the EU Standard Contractual Clauses (Module 2: controller-to-processor) adopted by
        Commission Implementing Decision (EU) 2021/914 are incorporated into this DPA by reference,
        with Controller as data exporter and Processor as data importer. The UK International Data
        Transfer Addendum and Swiss equivalent provisions apply where relevant. Annex A of this DPA
        satisfies Annex II of the SCCs.
      </p>

      <h2>6. Return or deletion</h2>
      <p>
        On termination of the underlying agreement, Processor will, at Controller&apos;s choice,
        return or delete all Customer Data within 30 days, unless retention is required by law.
        Controller can self-serve the return via the in-app data export at{" "}
        <code>/admin/data-export</code> at any time during the term and for 30 days after.
      </p>

      <h2>7. Audits</h2>
      <p>
        Processor will make its most recent SOC 2 Type II report (or, until that report is issued,
        evidence of its in-progress SOC 2 program with Drata) available to Controller under
        reasonable confidentiality terms upon written request to{" "}
        <a href={`mailto:${PROVIDER_IDENTITY.legalEmail}`}>{PROVIDER_IDENTITY.legalEmail}</a>.
        Controller may, no more than once per twelve-month period (and unless triggered by a
        confirmed breach), conduct an audit of Processor&apos;s compliance with this DPA on
        reasonable advance notice. The audit must be conducted during business hours, must not
        unreasonably interfere with Processor&apos;s operations, and is at Controller&apos;s
        expense.
      </p>

      <h2>Annex A — Technical and Organizational Measures</h2>
      <p>Processor implements and maintains the following measures:</p>
      <ul>
        <li>
          <strong>Encryption:</strong> TLS 1.2+ in transit; AES-256 at rest via managed Supabase and
          Vercel encryption.
        </li>
        <li>
          <strong>Access control:</strong> role-based access at the application layer (manager /
          instructor / viewer / agency_admin / agency_member) and row-level security at the database
          layer; mandatory MFA for all human production access; quarterly access reviews.
        </li>
        <li>
          <strong>Audit logging:</strong> append-only <code>audit_log</code> table records every
          mutating operation with org, actor, timestamp, and field-level diff; configurable
          retention with a minimum of 30 days.
        </li>
        <li>
          <strong>Network security:</strong> Vercel edge network; HTTPS-only; HSTS; per-isolate
          domain-routing with verified custom domains only.
        </li>
        <li>
          <strong>Vulnerability management:</strong> GitHub Dependabot weekly scans; documented SLA
          for high/critical CVEs; pre-commit lint + type checks.
        </li>
        <li>
          <strong>Backup and recovery:</strong> Supabase point-in-time recovery (Pro plan);
          quarterly restore drills with documented RTO 4h / RPO 5min.
        </li>
        <li>
          <strong>Incident response:</strong> documented runbook (see <a href="/trust">/trust</a>);
          quarterly tabletop exercises; 72-hour breach notification commitment per Section 3.
        </li>
        <li>
          <strong>Personnel:</strong> background screening for personnel with production access;
          confidentiality agreements; security awareness training annually.
        </li>
        <li>
          <strong>Subprocessor management:</strong> all subprocessors bound by written contracts
          imposing data protection obligations no less protective than this DPA; inventory at{" "}
          <a href="/legal/subprocessors">/legal/subprocessors</a>.
        </li>
      </ul>
    </LegalShell>
  );
}
