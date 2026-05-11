import Link from "next/link";
import { LEGAL_VERSIONS, PROVIDER_IDENTITY } from "@/lib/legal/versions";
import LegalDisclaimer from "@/components/legal/legal-disclaimer";
import LegalFooter from "@/components/legal/legal-footer";

const DOCUMENTS: {
  key: keyof typeof LEGAL_VERSIONS;
  href: string;
  title: string;
  description: string;
}[] = [
  {
    key: "terms",
    href: "/legal/terms",
    title: "Terms of Service",
    description: "Master agreement governing use of the Arbor platform.",
  },
  {
    key: "privacy",
    href: "/legal/privacy",
    title: "Privacy Policy",
    description: "What personal data we collect, how we use it, and your rights.",
  },
  {
    key: "cookies",
    href: "/legal/cookies",
    title: "Cookie Policy",
    description: "How and why we use browser cookies and similar technologies.",
  },
  {
    key: "dpa",
    href: "/legal/dpa",
    title: "Data Processing Addendum",
    description: "GDPR / CCPA processor terms for B2B customers.",
  },
  {
    key: "baa",
    href: "/legal/baa",
    title: "Business Associate Agreement",
    description: "HIPAA-compliant agreement template for healthcare customers.",
  },
  {
    key: "subprocessors",
    href: "/legal/subprocessors",
    title: "Subprocessor List",
    description: "Every third party that processes customer data.",
  },
  {
    key: "aup",
    href: "/legal/aup",
    title: "Acceptable Use Policy",
    description: "What you can and can't do with the Arbor platform.",
  },
  {
    key: "sla",
    href: "/legal/sla",
    title: "Service Level Agreement",
    description: "Uptime commitments, support response times, and credits.",
  },
  {
    key: "reseller",
    href: "/legal/reseller-agreement",
    title: "Reseller / Agency Agreement",
    description: "Terms for white-label resellers (consulting agencies).",
  },
];

export const metadata = {
  title: `Legal — ${PROVIDER_IDENTITY.tradeName}`,
  description: "Terms, Privacy, DPA, BAA, AUP, SLA, and reseller agreement for the Arbor platform.",
};

export default function LegalIndexPage() {
  return (
    <div className="bg-canvas min-h-screen">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <header className="mb-6">
          <h1 className="text-foreground text-3xl font-bold">Legal</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Every binding document that governs use of {PROVIDER_IDENTITY.tradeName}. For questions
            email{" "}
            <a href={`mailto:${PROVIDER_IDENTITY.legalEmail}`} className="text-primary underline">
              {PROVIDER_IDENTITY.legalEmail}
            </a>
            .
          </p>
        </header>

        <LegalDisclaimer />

        <ul className="mt-8 space-y-3">
          {DOCUMENTS.map((doc) => (
            <li key={doc.key}>
              <Link
                href={doc.href}
                className="border-border bg-background hover:border-primary block rounded-xl border p-5 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-foreground text-base font-semibold">{doc.title}</p>
                    <p className="text-muted-foreground mt-1 text-sm">{doc.description}</p>
                  </div>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    v{LEGAL_VERSIONS[doc.key]}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>

        <p className="text-muted-foreground mt-12 text-center text-xs">
          {PROVIDER_IDENTITY.legalName} ({PROVIDER_IDENTITY.tradeName}) ·{" "}
          {PROVIDER_IDENTITY.jurisdiction}
        </p>
      </div>
      <LegalFooter />
    </div>
  );
}
