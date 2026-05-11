import Link from "next/link";
import {
  ShieldCheckIcon,
  LockClosedIcon,
  KeyIcon,
  DocumentMagnifyingGlassIcon,
  ServerStackIcon,
  CloudArrowUpIcon,
  EnvelopeIcon,
  CheckBadgeIcon,
} from "@heroicons/react/24/outline";
import { PROVIDER_IDENTITY } from "@/lib/legal/versions";
import LegalFooter from "@/components/legal/legal-footer";

export const metadata = { title: `Trust & security — ${PROVIDER_IDENTITY.tradeName}` };

const FEATURES = [
  {
    icon: ShieldCheckIcon,
    title: "Row-level security on every tenant table",
    description:
      "Postgres RLS enforces that no row crosses an organization boundary, even with leaked database credentials. Every server action also checks role-based access.",
  },
  {
    icon: LockClosedIcon,
    title: "Encrypted at rest and in transit",
    description:
      "AES-256 at rest via Supabase managed encryption. TLS 1.2+ in transit. HSTS on every response. Custom-domain TLS provisioned automatically via Vercel.",
  },
  {
    icon: KeyIcon,
    title: "SAML SSO + MFA-ready auth",
    description:
      "Per-org SAML SSO so customers can use their existing identity provider (AzureAD, Okta, Google Workspace). MFA enforced for all production access on our side.",
  },
  {
    icon: DocumentMagnifyingGlassIcon,
    title: "Comprehensive audit log",
    description:
      "Every mutating operation lands in an append-only audit_log table with org, actor, timestamp, and field-level diff. Default 5-year retention; per-org override with a 30-day floor.",
  },
  {
    icon: ServerStackIcon,
    title: "Backup + tested restore",
    description:
      "Supabase point-in-time recovery to any second within the retention window. Quarterly restore drills with documented RTO 4h / RPO 5min.",
  },
  {
    icon: CloudArrowUpIcon,
    title: "Per-org data export",
    description:
      "Customers can download a complete ZIP of every tenant table from /admin/data-export at any time — for portability, GDPR access requests, or off-platform backup.",
  },
  {
    icon: EnvelopeIcon,
    title: "Outbound webhook hardening",
    description:
      "HMAC-SHA256 signed payloads. Server-side SSRF guard rejects URLs that resolve to private/internal address space. Failed deliveries replayable from the admin UI.",
  },
  {
    icon: CheckBadgeIcon,
    title: "API key auth + scopes",
    description:
      "Bcrypt-hashed bearer tokens. Issued from /admin/settings/api with scope picker. Read-only keys cannot reach write endpoints. Revocation is immediate.",
  },
];

export default function TrustPage() {
  return (
    <div className="bg-canvas min-h-screen">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <header className="mb-10">
          <h1 className="text-foreground text-3xl font-bold">Trust &amp; security</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
            Where {PROVIDER_IDENTITY.tradeName} stands on security, privacy, and operational
            readiness — and how to get the evidence you need for procurement.
          </p>
        </header>

        {/* Compliance status */}
        <section className="border-border bg-background mb-8 rounded-xl border p-6">
          <h2 className="text-foreground text-base font-bold">Compliance status</h2>
          <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Status
              label="SOC 2 Type II"
              status="In progress"
              detail="Drata-managed program. Engineering controls (access, audit, backup, retention, dependency hygiene, runbooks) implemented. Type II report available within ~6 months of audit kickoff."
            />
            <Status
              label="HIPAA"
              status="BAA available"
              detail="Hospital and other covered-entity customers can request a Business Associate Agreement before transmitting PHI. Supabase HIPAA add-on covers the data layer; Vercel HIPAA add-on covers hosting."
            />
            <Status
              label="GDPR"
              status="Aligned"
              detail="DPA available with EU SCCs incorporated. EEA / UK / Swiss customers covered. Subject access requests fulfilled via /admin/data-export plus admin-assisted erasure."
            />
            <Status
              label="CCPA / CPRA"
              status="Aligned"
              detail="Privacy Policy honors disclosure, deletion, and opt-out-of-sale rights (we do not sell personal information). Cookie banner offers reject-non-essential."
            />
          </dl>
        </section>

        {/* Features */}
        <section className="mb-8">
          <h2 className="text-foreground text-base font-bold">Security features</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="border-border bg-background flex gap-3 rounded-xl border p-5"
              >
                <f.icon className="text-primary mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="text-foreground text-sm font-semibold">{f.title}</p>
                  <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                    {f.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* How to get evidence */}
        <section className="border-border bg-background mb-8 rounded-xl border p-6">
          <h2 className="text-foreground text-base font-bold">Procurement evidence</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            Reach{" "}
            <a href={`mailto:${PROVIDER_IDENTITY.legalEmail}`} className="text-primary underline">
              {PROVIDER_IDENTITY.legalEmail}
            </a>{" "}
            for any of the following under NDA:
          </p>
          <ul className="text-muted-foreground mt-3 list-inside list-disc space-y-1 text-sm">
            <li>Most recent SOC 2 Type II report (or in-progress evidence pack from Drata)</li>
            <li>Pre-signed Business Associate Agreement (HIPAA)</li>
            <li>Pre-signed Data Processing Addendum with EU SCCs</li>
            <li>Vendor security questionnaire response (CAIQ, SIG, custom)</li>
            <li>Penetration test summary (annual)</li>
            <li>Architecture and data-flow diagrams</li>
          </ul>
        </section>

        {/* Reporting */}
        <section className="border-border bg-background mb-8 rounded-xl border p-6">
          <h2 className="text-foreground text-base font-bold">Report a security issue</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            Email{" "}
            <a
              href={`mailto:${PROVIDER_IDENTITY.securityEmail}`}
              className="text-primary underline"
            >
              {PROVIDER_IDENTITY.securityEmail}
            </a>
            . We acknowledge within one business day. Coordinated disclosure is welcomed; we do not
            pursue good-faith security researchers who follow responsible-disclosure norms.
          </p>
        </section>

        {/* Quick links */}
        <section className="border-border bg-background mb-8 rounded-xl border p-6">
          <h2 className="text-foreground text-base font-bold">Documents</h2>
          <ul className="text-primary mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <li>
              <Link href="/legal/dpa" className="hover:underline">
                Data Processing Addendum
              </Link>
            </li>
            <li>
              <Link href="/legal/baa" className="hover:underline">
                Business Associate Agreement
              </Link>
            </li>
            <li>
              <Link href="/legal/subprocessors" className="hover:underline">
                Subprocessor list
              </Link>
            </li>
            <li>
              <Link href="/legal/sla" className="hover:underline">
                Service Level Agreement
              </Link>
            </li>
            <li>
              <Link href="/legal/aup" className="hover:underline">
                Acceptable Use Policy
              </Link>
            </li>
            <li>
              <Link href="/legal" className="hover:underline">
                All legal documents
              </Link>
            </li>
          </ul>
        </section>
      </div>
      <LegalFooter />
    </div>
  );
}

function Status({ label, status, detail }: { label: string; status: string; detail: string }) {
  return (
    <div className="border-border rounded-lg border p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-foreground text-sm font-semibold">{label}</p>
        <span className="text-primary text-xs font-medium">{status}</span>
      </div>
      <p className="text-muted-foreground mt-2 text-xs leading-relaxed">{detail}</p>
    </div>
  );
}
