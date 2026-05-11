import LegalShell from "@/components/legal/legal-shell";
import { LEGAL_VERSIONS, PROVIDER_IDENTITY } from "@/lib/legal/versions";

export const metadata = { title: "Acceptable Use Policy — Arbor" };

export default function AupPage() {
  const v = LEGAL_VERSIONS.aup;
  return (
    <LegalShell title="Acceptable Use Policy" version={v} effectiveDate={v}>
      <p>
        This Acceptable Use Policy (&quot;<strong>AUP</strong>&quot;) describes prohibited uses of
        the {PROVIDER_IDENTITY.tradeName} Service. It supplements the Terms of Service. Violation is
        grounds for immediate suspension or termination.
      </p>

      <h2>1. Prohibited content</h2>
      <p>You may not use the Service to upload, transmit, or share content that:</p>
      <ul>
        <li>
          infringes any patent, trademark, copyright, trade secret, or other intellectual property
          right;
        </li>
        <li>is defamatory, obscene, harassing, threatening, or otherwise unlawful;</li>
        <li>contains malicious code, malware, viruses, or destructive payloads;</li>
        <li>contains real Protected Health Information unless an executed BAA is in place;</li>
        <li>
          contains payment card numbers, government IDs, or other sensitive identifiers outside the
          documented PHI fields under an executed BAA;
        </li>
        <li>was obtained without the consent or legal right of the data subjects.</li>
      </ul>

      <h2>2. Prohibited activities</h2>
      <p>You may not:</p>
      <ul>
        <li>
          attempt to probe, scan, or test the vulnerability of the Service except via our
          coordinated disclosure program (email{" "}
          <a href={`mailto:${PROVIDER_IDENTITY.securityEmail}`}>
            {PROVIDER_IDENTITY.securityEmail}
          </a>
          );
        </li>
        <li>
          interfere with or disrupt the Service, the servers or networks connected to the Service,
          or any other user&apos;s use of the Service;
        </li>
        <li>
          generate excessive load — including (a) calling <code>/api/v1/*</code> above the published
          rate limit, (b) generating webhook deliveries to internal/private addresses, (c) running
          uncoordinated bulk imports that exceed reasonable per-org volumes;
        </li>
        <li>
          impersonate any person or entity, or misrepresent your affiliation with a person or
          entity;
        </li>
        <li>
          attempt to gain unauthorized access to any portion of the Service, or to any other systems
          or networks connected to the Service;
        </li>
        <li>
          sell, lease, or sublicense access to the Service except under an executed Reseller
          Agreement (see <a href="/legal/reseller-agreement">/legal/reseller-agreement</a>);
        </li>
        <li>
          use the Service to send unsolicited mass communications, market third-party products, or
          violate the CAN-SPAM Act, GDPR e-Privacy directive, or equivalent laws;
        </li>
        <li>
          attempt to circumvent technical limitations, including the SSRF allowlist on outbound
          webhooks, the IP/email throttle on agency signup, the rate limit on REST endpoints, or the
          role-based access controls within an organization.
        </li>
      </ul>

      <h2>3. Webhook and API integrations</h2>
      <p>
        You are responsible for the security and lawful operation of any endpoint you register to
        receive Arbor webhooks, and any system that uses an Arbor API key. In particular:
      </p>
      <ul>
        <li>
          do not register webhook URLs that resolve to private/internal addresses or cloud metadata
          services — these are blocked by our SSRF guard, which will fail your deliveries;
        </li>
        <li>
          rotate API keys promptly if compromised. Keys can be revoked immediately at{" "}
          <code>/admin/settings/api</code>;
        </li>
        <li>
          treat the webhook signing secret as a credential. Verify <code>X-Arbor-Signature</code> on
          every inbound delivery.
        </li>
      </ul>

      <h2>4. Reporting violations</h2>
      <p>
        Report suspected violations to{" "}
        <a href={`mailto:${PROVIDER_IDENTITY.securityEmail}`}>{PROVIDER_IDENTITY.securityEmail}</a>.
        We aim to acknowledge within one business day.
      </p>

      <h2>5. Enforcement</h2>
      <p>
        We may, at our discretion and without prior notice in case of imminent risk, suspend or
        terminate access for any user, organization, or agency we believe has violated this AUP. For
        non-imminent issues we will normally provide written notice and a reasonable cure period.
      </p>
    </LegalShell>
  );
}
