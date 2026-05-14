import Link from "next/link";
import { CheckIcon } from "@heroicons/react/24/outline";
import { PROVIDER_IDENTITY } from "@/lib/legal/versions";
import LegalFooter from "@/components/legal/legal-footer";

export const metadata = { title: `Pricing — ${PROVIDER_IDENTITY.tradeName}` };

const TIERS = [
  {
    name: "Small",
    teamSize: "Under 25 active users",
    price: "$30,000",
    cadence: "/year",
    description: "Single hospital or single department starting with structured training ops.",
    cta: "Contact sales",
    highlight: false,
  },
  {
    name: "Medium",
    teamSize: "25–100 active users",
    price: "$50,000",
    cadence: "/year",
    description: "Multi-department training program with dedicated coordinators.",
    cta: "Contact sales",
    highlight: true,
  },
  {
    name: "Large",
    teamSize: "100–500 active users",
    price: "$75,000",
    cadence: "/year",
    description: "Health system rollouts, multi-site delivery, EMR implementation programs.",
    cta: "Contact sales",
    highlight: false,
  },
  {
    name: "Enterprise",
    teamSize: "500+ active users",
    price: "Custom",
    cadence: "",
    description:
      "Multi-system rollouts with custom SLA, dedicated CSM, and white-glove onboarding.",
    cta: "Talk to us",
    highlight: false,
  },
];

const INCLUDED = [
  "Every feature — no per-feature add-ons",
  "Unlimited departments + projects + work intake",
  "SAML SSO per organization",
  "Custom domain + branded login",
  "Audit log with 5-year retention",
  "Per-org data export (GDPR / HIPAA portability)",
  "REST API + signed outbound webhooks",
  "Email support, weekday business hours",
  "99.9% uptime SLA with service credits",
  "BAA available (HIPAA covered entities)",
];

export default function PricingPage() {
  return (
    <div className="bg-canvas min-h-screen">
      {/* Header */}
      <header className="border-border bg-background border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-foreground font-serif text-xl tracking-tight">
            {PROVIDER_IDENTITY.tradeName}
          </Link>
          <nav className="flex items-center gap-5 text-sm">
            <Link href="/pricing" className="text-primary font-medium">
              Pricing
            </Link>
            <Link href="/trust" className="text-foreground hover:text-primary">
              Trust
            </Link>
            <Link href="/agency-signup" className="text-foreground hover:text-primary">
              For agencies
            </Link>
            <Link
              href="/login"
              className="border-border text-foreground hover:bg-surface rounded-md border px-3 py-1.5 font-medium"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-16">
        <div className="text-center">
          <h1 className="text-foreground font-serif text-4xl tracking-tight">
            Simple, predictable pricing
          </h1>
          <p className="text-muted-foreground mx-auto mt-3 max-w-2xl text-sm leading-relaxed">
            Annual subscriptions. No per-seat metering, no feature gates, no surprise overages.
            Pricing scales by the size of your active training team. Invoiced annually with Net 30
            terms.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className={`relative flex flex-col rounded-xl border p-6 ${
                tier.highlight
                  ? "border-primary bg-background ring-primary ring-2"
                  : "border-border bg-background"
              }`}
            >
              {tier.highlight && (
                <span className="bg-primary text-primary-foreground absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-0.5 text-xs font-medium">
                  Most common
                </span>
              )}
              <p className="text-foreground text-base font-bold">{tier.name}</p>
              <p className="text-muted-foreground mt-1 text-xs">{tier.teamSize}</p>
              <p className="text-foreground mt-4 text-3xl font-bold tabular-nums tracking-tight">
                {tier.price}
                <span className="text-muted-foreground text-sm font-normal">{tier.cadence}</span>
              </p>
              <p className="text-muted-foreground mt-3 flex-1 text-xs leading-relaxed">
                {tier.description}
              </p>
              <a
                href={`mailto:sales@arbor.app?subject=${encodeURIComponent(`Arbor ${tier.name} tier inquiry`)}`}
                className={`mt-6 rounded-md px-4 py-2 text-center text-sm font-medium ${
                  tier.highlight
                    ? "bg-primary text-primary-foreground hover:opacity-90"
                    : "border-border text-foreground hover:bg-surface border"
                }`}
              >
                {tier.cta}
              </a>
            </div>
          ))}
        </div>

        {/* What's included */}
        <section className="border-border bg-background mt-16 rounded-2xl border p-8">
          <h2 className="text-foreground text-base font-bold">Every plan includes</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            We don&apos;t feature-gate. Whatever tier you&apos;re on, you get the whole product.
          </p>
          <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {INCLUDED.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm">
                <CheckIcon className="text-primary mt-0.5 h-4 w-4 shrink-0" />
                <span className="text-foreground">{item}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* FAQ */}
        <section className="mt-16">
          <h2 className="text-foreground text-base font-bold">Frequently asked</h2>
          <dl className="mt-6 space-y-6 text-sm">
            <Faq
              q='How is "active user" defined?'
              a="Anyone with a non-revoked org_membership at the end of a billing cycle. We don't count one-off invitees who never accepted, and we don't count trial accounts."
            />
            <Faq
              q="What happens if we cross a tier mid-year?"
              a="Stay on your current tier through the renewal date. At renewal we'll move you to the appropriate tier. We don't bill mid-cycle upgrades unless you want to add features that require it (e.g. enterprise SLA)."
            />
            <Faq
              q="Do you offer free trials?"
              a="We offer a 30-day proof-of-concept on a sandbox tenant for serious evaluations. Contact sales to scope it."
            />
            <Faq
              q="How do I pay?"
              a="Manual invoicing for now (no Stripe). We email a PDF invoice to your billing contact; pay by ACH, wire, or check on Net 30 terms. Stripe + ACH self-serve is on the roadmap."
            />
            <Faq
              q="What about consulting agencies?"
              a={
                <>
                  We have a white-label reseller program. You sell {PROVIDER_IDENTITY.tradeName}{" "}
                  under your own brand and domain; we invoice you a 30% revenue share. Start at{" "}
                  <Link href="/agency-signup" className="text-primary underline">
                    /agency-signup
                  </Link>
                  .
                </>
              }
            />
            <Faq
              q="Is there a HIPAA BAA?"
              a={
                <>
                  Yes. Request one before transmitting any PHI; the template is at{" "}
                  <Link href="/legal/baa" className="text-primary underline">
                    /legal/baa
                  </Link>
                  .
                </>
              }
            />
          </dl>
        </section>

        <p className="text-muted-foreground mt-16 text-center text-xs">
          Questions? Email{" "}
          <a href="mailto:sales@arbor.app" className="text-primary underline">
            sales@arbor.app
          </a>
          . We answer in one business day.
        </p>
      </main>

      <LegalFooter />
    </div>
  );
}

function Faq({ q, a }: { q: string; a: React.ReactNode }) {
  return (
    <div className="border-border border-b pb-6 last:border-b-0">
      <dt className="text-foreground text-sm font-semibold">{q}</dt>
      <dd className="text-muted-foreground mt-2 text-sm leading-relaxed">{a}</dd>
    </div>
  );
}
