import Link from "next/link";
import SignupForm from "./signup-form";

export default function AgencySignupPage() {
  return (
    <div className="bg-canvas min-h-screen">
      <div className="mx-auto max-w-2xl space-y-8 px-6 py-16">
        <header className="text-center">
          <Link href="/login" className="text-muted-foreground hover:text-foreground text-xs">
            Already have an account? Sign in →
          </Link>
          <h1 className="text-foreground mt-4 text-3xl font-bold">Start your Arbor agency</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            White-label Arbor for your hospital training clients. You&apos;ll get an agency console,
            custom branding, custom domain, and per-client billing — under your name, not ours.
          </p>
        </header>

        <SignupForm />

        <section className="border-border bg-background space-y-3 rounded-xl border p-5 text-sm">
          <h2 className="text-foreground text-base font-bold">What happens next</h2>
          <ol className="text-muted-foreground list-inside list-decimal space-y-1 text-xs">
            <li>We email you a magic-link to sign in.</li>
            <li>You land in the agency console at /agency.</li>
            <li>Provision your first client org from /agency/clients/new.</li>
            <li>Customize branding + domain at /agency/branding and /agency/domain.</li>
            <li>Record your first contract at /agency/billing/new-contract.</li>
          </ol>
        </section>

        <p className="text-muted-foreground text-center text-xs">
          By signing up you agree to the Arbor Terms of Service. No credit card required — billing
          is invoiced manually after your first paying client.
        </p>
      </div>
    </div>
  );
}
