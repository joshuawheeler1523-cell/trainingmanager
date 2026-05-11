import LegalShell from "@/components/legal/legal-shell";
import { LEGAL_VERSIONS, PROVIDER_IDENTITY } from "@/lib/legal/versions";

export const metadata = { title: "Business Associate Agreement — Arbor" };

export default function BaaPage() {
  const v = LEGAL_VERSIONS.baa;
  return (
    <LegalShell title="Business Associate Agreement" version={v} effectiveDate={v}>
      <p>
        This Business Associate Agreement (&quot;<strong>BAA</strong>&quot;) supplements the Terms
        of Service between Customer (&quot;<strong>Covered Entity</strong>&quot;) and{" "}
        {PROVIDER_IDENTITY.legalName} (&quot;<strong>Business Associate</strong>&quot;) and applies
        whenever Business Associate creates, receives, maintains, or transmits Protected Health
        Information (&quot;<strong>PHI</strong>&quot;) on behalf of Covered Entity in connection
        with the {PROVIDER_IDENTITY.tradeName} Service. It is intended to comply with the Health
        Insurance Portability and Accountability Act of 1996 and its implementing regulations (the
        &quot;<strong>HIPAA Rules</strong>&quot;), including the Privacy, Security, and Breach
        Notification Rules at 45 CFR Parts 160 and 164.
      </p>
      <p>
        <strong>
          This BAA must be countersigned by an authorized representative of each party before any
          PHI is transmitted to the Service.
        </strong>{" "}
        Acceptance via the in-app acceptance flow does not constitute execution; an executed PDF
        (delivered via <code>/admin/legal/baa</code>) is required.
      </p>

      <h2>1. Definitions</h2>
      <p>
        Capitalized terms used but not defined in this BAA have the meaning given in the HIPAA
        Rules. &quot;<strong>PHI</strong>&quot; has the meaning given in 45 CFR § 160.103, limited
        to the information Business Associate creates, receives, maintains, or transmits for or on
        behalf of Covered Entity.
      </p>

      <h2>2. Permitted Uses and Disclosures</h2>
      <p>Business Associate may use or disclose PHI only as follows:</p>
      <ul>
        <li>
          to perform the functions, activities, or services for, or on behalf of, Covered Entity as
          described in the Terms of Service;
        </li>
        <li>
          for the proper management and administration of Business Associate or to carry out its
          legal responsibilities, provided that any disclosure is required by law or the recipient
          provides reasonable assurances of confidentiality;
        </li>
        <li>
          to provide data aggregation services as that term is defined at 45 CFR § 164.501, relating
          to the health care operations of Covered Entity;
        </li>
        <li>as Required by Law.</li>
      </ul>

      <h2>3. Obligations of Business Associate</h2>
      <p>Business Associate will:</p>
      <ul>
        <li>not use or disclose PHI other than as permitted by this BAA or Required by Law;</li>
        <li>
          implement appropriate administrative, physical, and technical safeguards (and comply with
          the HIPAA Security Rule with respect to electronic PHI) to prevent use or disclosure of
          PHI other than as permitted by this BAA;
        </li>
        <li>
          report to Covered Entity any use or disclosure of PHI not permitted by this BAA (including
          a Breach of Unsecured PHI) without unreasonable delay, and in any event no later than 30
          calendar days after Discovery; for confirmed Breaches, deliver the notification required
          by 45 CFR § 164.410 within 60 days of Discovery;
        </li>
        <li>
          ensure that any subcontractor that creates, receives, maintains, or transmits PHI on
          behalf of Business Associate agrees in writing to the same restrictions and conditions
          that apply to Business Associate, in compliance with 45 CFR § 164.502(e)(1)(ii);
        </li>
        <li>
          make PHI available to Covered Entity (or, at Covered Entity&apos;s direction, an
          individual) as necessary to satisfy Covered Entity&apos;s obligations under 45 CFR §§
          164.524 (access), 164.526 (amendment), and 164.528 (accounting of disclosures), within the
          time and manner required by the HIPAA Rules;
        </li>
        <li>
          make its internal practices, books, and records relating to the use and disclosure of PHI
          available to the Secretary of Health and Human Services for purposes of determining
          compliance with the HIPAA Rules;
        </li>
        <li>
          to the extent Business Associate is to carry out an obligation of Covered Entity under
          Subpart E of 45 CFR Part 164, comply with the requirements of Subpart E that apply to
          Covered Entity in the performance of such obligation.
        </li>
      </ul>

      <h2>4. Permitted Subcontractors</h2>
      <p>
        Covered Entity authorizes Business Associate to engage as subcontractors the subprocessors
        listed at <a href="/legal/subprocessors">/legal/subprocessors</a>, each of which has
        executed a HIPAA-compliant business associate agreement with Business Associate or operates
        under a Business Associate Agreement available from the subprocessor (e.g. Supabase HIPAA
        add-on, Vercel HIPAA add-on). Business Associate will not engage additional subcontractors
        that will receive PHI without first executing a compliant BAA and providing notice in
        accordance with <a href="/legal/dpa">Section 4 of the DPA</a>.
      </p>

      <h2>5. Term and Termination</h2>
      <p>
        This BAA is effective on the latest party signature date and remains in effect until the
        termination of the underlying Terms of Service. Either party may terminate this BAA
        immediately if the other party has materially breached an obligation under this BAA and
        failed to cure within 30 days of written notice. Upon termination, Business Associate will,
        at Covered Entity&apos;s option, return or destroy all PHI it maintains in any form within
        30 days, unless return or destruction is infeasible, in which case the protections of this
        BAA will continue to apply to the retained PHI.
      </p>

      <h2>6. Compliance with the HIPAA Security Rule</h2>
      <p>
        Business Associate will comply with the applicable provisions of the HIPAA Security Rule (45
        CFR Part 164, Subpart C), including the implementation of administrative, physical, and
        technical safeguards described in Annex A of the{" "}
        <a href="/legal/dpa">Data Processing Addendum</a>, which is incorporated into this BAA by
        reference.
      </p>

      <h2>7. Breach Notification</h2>
      <p>
        Business Associate will notify Covered Entity of any Breach of Unsecured PHI in accordance
        with 45 CFR § 164.410. The notification will include, to the extent known: (a)
        identification of each individual whose Unsecured PHI has been or is reasonably believed to
        have been accessed, acquired, used, or disclosed; (b) any other available information
        Covered Entity is required to include in notifications to individuals under 45 CFR §
        164.404(c) at the time of the notification; (c) the steps Business Associate has taken to
        investigate, mitigate, and prevent recurrence.
      </p>

      <h2>8. Miscellaneous</h2>
      <p>
        Any ambiguity in this BAA will be resolved in favor of a meaning that permits compliance
        with the HIPAA Rules. The parties agree to take such action as is necessary to amend this
        BAA from time to time as is necessary for compliance with changes to the HIPAA Rules. This
        BAA supersedes any prior agreement between the parties on the subject of business associate
        obligations.
      </p>

      <p className="border-border mt-12 border-t pt-6">
        <strong>To execute this BAA</strong> for your organization, sign in as a manager and request
        execution at <code>/admin/legal/baa</code>, or email{" "}
        <a href={`mailto:${PROVIDER_IDENTITY.legalEmail}`}>{PROVIDER_IDENTITY.legalEmail}</a> with
        your organization name, signer name, signer title, and signer email. Business Associate will
        deliver a countersigned PDF for your records.
      </p>
    </LegalShell>
  );
}
