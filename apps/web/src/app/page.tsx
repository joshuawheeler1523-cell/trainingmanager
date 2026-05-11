import Link from "next/link";
import {
  ChartBarIcon,
  ClipboardDocumentListIcon,
  CalendarDaysIcon,
  UsersIcon,
  ShieldCheckIcon,
  BuildingOffice2Icon,
} from "@heroicons/react/24/outline";
import { PROVIDER_IDENTITY } from "@/lib/legal/versions";
import LegalFooter from "@/components/legal/legal-footer";

export const metadata = {
  title: `${PROVIDER_IDENTITY.tradeName} — training operations for hospitals`,
  description:
    "Capacity planning, training-record management, and resource allocation for hospital training departments. Built for the people who plan and deliver clinical education.",
};

const FEATURES = [
  {
    icon: UsersIcon,
    title: "Instructor capacity",
    description:
      "See who's over-allocated, who has room, and where to rebalance — across departments, in real time.",
  },
  {
    icon: ClipboardDocumentListIcon,
    title: "TRA workflow",
    description:
      "Capture training resource asks in a structured 9-section wizard. Convert approved TRAs into projects with one click.",
  },
  {
    icon: CalendarDaysIcon,
    title: "Implementation planning",
    description:
      "Schedule classes, assign trainers, manage rooms, and detect conflicts before they become a Monday-morning fire.",
  },
  {
    icon: ChartBarIcon,
    title: "Recommendations engine",
    description:
      "Domain-specific suggestions for instructor rebalancing, project staffing, and at-risk milestone recovery.",
  },
  {
    icon: BuildingOffice2Icon,
    title: "Multi-org & white-label",
    description:
      "Operate across multiple hospitals from a single console — or resell under your own consulting brand and domain.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Healthcare-ready security",
    description:
      "Row-level security on every tenant table. SAML SSO. Audit log. SOC 2 Type II in progress. BAA available.",
  },
];

export default function HomePage() {
  return (
    <div className="bg-canvas min-h-screen">
      {/* Header */}
      <header className="border-border bg-background border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-foreground font-serif text-xl tracking-tight">
            {PROVIDER_IDENTITY.tradeName}
          </Link>
          <nav className="flex items-center gap-5 text-sm">
            <Link href="/pricing" className="text-foreground hover:text-primary">
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

      {/* Hero */}
      <section className="border-border border-b">
        <div className="mx-auto max-w-6xl px-6 py-20 text-center sm:py-28">
          <p className="text-primary text-xs font-semibold uppercase tracking-[0.32em]">
            Training operations · for hospitals
          </p>
          <h1 className="text-foreground mt-6 font-serif text-4xl tracking-tight sm:text-5xl">
            Plan training capacity like the operations problem it actually is
          </h1>
          <p className="text-muted-foreground mx-auto mt-5 max-w-2xl text-base leading-relaxed">
            {PROVIDER_IDENTITY.tradeName} replaces the spreadsheets, ad-hoc trackers, and
            hallway-conversation handoffs that hospital training departments use to manage
            instructors, training resource asks, and implementation projects.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/login"
              className="bg-primary text-primary-foreground rounded-md px-5 py-2.5 text-sm font-medium hover:opacity-90"
            >
              Sign in to your account
            </Link>
            <Link
              href="/pricing"
              className="border-border text-foreground hover:bg-surface rounded-md border px-5 py-2.5 text-sm font-medium"
            >
              See pricing
            </Link>
            <a
              href="mailto:sales@arbor.app?subject=Arbor%20demo%20request"
              className="text-muted-foreground hover:text-foreground px-3 py-2 text-sm underline-offset-4 hover:underline"
            >
              Or request a demo →
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="text-center">
          <h2 className="text-foreground font-serif text-3xl tracking-tight">
            Built for the people who plan and deliver clinical education
          </h2>
          <p className="text-muted-foreground mx-auto mt-3 max-w-2xl text-sm">
            From day-to-day instructor management to long-arc EMR implementation rollouts.
          </p>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="border-border bg-background flex flex-col gap-3 rounded-xl border p-6"
            >
              <span
                aria-hidden="true"
                className="bg-surface text-primary inline-flex h-10 w-10 items-center justify-center rounded-lg"
              >
                <f.icon className="h-5 w-5" />
              </span>
              <h3 className="text-foreground text-base font-bold">{f.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Reseller CTA */}
      <section className="border-border bg-background border-y">
        <div className="mx-auto max-w-4xl px-6 py-16 text-center">
          <h2 className="text-foreground font-serif text-2xl tracking-tight">
            Are you a consulting firm?
          </h2>
          <p className="text-muted-foreground mx-auto mt-3 max-w-xl text-sm">
            White-label {PROVIDER_IDENTITY.tradeName} for your hospital training clients. Your logo,
            your brand colors, your domain, your pricing. We invoice you a 30% revenue share; you
            collect from the hospital and keep 70%.
          </p>
          <Link
            href="/agency-signup"
            className="bg-primary text-primary-foreground mt-6 inline-block rounded-md px-5 py-2.5 text-sm font-medium hover:opacity-90"
          >
            Start an agency account
          </Link>
        </div>
      </section>

      {/* Trust strip */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid grid-cols-1 gap-6 text-center sm:grid-cols-3">
          <Trust
            title="SOC 2 Type II"
            detail="Audit in progress with Drata. Evidence pack available under NDA."
          />
          <Trust title="HIPAA" detail="BAA available before any PHI is transmitted." />
          <Trust
            title="GDPR + CCPA"
            detail="DPA available with EU SCCs. Data exports self-serve."
          />
        </div>
        <p className="text-muted-foreground mt-8 text-center text-xs">
          Read the full security posture at{" "}
          <Link href="/trust" className="text-primary underline">
            /trust
          </Link>
          .
        </p>
      </section>

      <LegalFooter />
    </div>
  );
}

function Trust({ title, detail }: { title: string; detail: string }) {
  return (
    <div>
      <p className="text-foreground text-base font-semibold">{title}</p>
      <p className="text-muted-foreground mt-1 text-xs leading-relaxed">{detail}</p>
    </div>
  );
}
