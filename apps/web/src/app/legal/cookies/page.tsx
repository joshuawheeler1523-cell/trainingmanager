import LegalShell from "@/components/legal/legal-shell";
import { LEGAL_VERSIONS, PROVIDER_IDENTITY } from "@/lib/legal/versions";

export const metadata = { title: "Cookie Policy — Arbor" };

export default function CookiesPage() {
  const v = LEGAL_VERSIONS.cookies;
  return (
    <LegalShell title="Cookie Policy" version={v} effectiveDate={v}>
      <p>
        This Cookie Policy explains how {PROVIDER_IDENTITY.tradeName} uses cookies and similar
        technologies (such as <code>localStorage</code> entries) on the Service. It supplements our{" "}
        <a href="/legal/privacy">Privacy Policy</a>.
      </p>

      <h2>1. What are cookies?</h2>
      <p>
        Cookies are small text files placed on your device when you visit a website. They are used
        to remember your preferences, keep you signed in, and (with your consent) measure how the
        Service is used. Some cookies are set by us (&quot;<strong>first-party</strong>&quot;) and
        some by third parties whose services we embed (&quot;
        <strong>third-party</strong>&quot;).
      </p>

      <h2>2. The cookies we use</h2>
      <h3>2.1 Strictly necessary</h3>
      <p>Required to make the Service work — you cannot opt out of these.</p>
      <ul>
        <li>
          <code>sb-*</code>: Supabase authentication session cookies. Identifies your signed-in
          session.
        </li>
        <li>
          <code>arbor.activeOrgId</code>: which organization you&apos;re currently operating in
          (used to scope every page).
        </li>
        <li>
          <code>arbor.cookie-consent</code>: stores your consent choices so we don&apos;t prompt you
          on every page load.
        </li>
      </ul>

      <h3>2.2 Functional</h3>
      <p>Remember your UI preferences (dark mode, sidebar state). Set on first interaction.</p>

      <h3>2.3 Analytics</h3>
      <p>
        Used only with your consent. Currently we do not use any third-party analytics provider; if
        we add one (e.g. PostHog, Plausible) we will update this policy and re-prompt for consent.
      </p>

      <h3>2.4 Marketing / advertising</h3>
      <p>We do not use marketing or advertising cookies.</p>

      <h2>3. Managing your cookie choices</h2>
      <p>
        On your first visit you&apos;ll see a cookie banner letting you accept all, reject all
        non-essential, or customize your choices. You can revisit your choices at any time by
        clicking <em>Cookie preferences</em> in the page footer. You can also clear or block cookies
        via your browser&apos;s settings; doing so for strictly-necessary cookies will prevent the
        Service from functioning.
      </p>

      <h2>4. Do Not Track</h2>
      <p>
        Some browsers send a Do Not Track (DNT) signal. We currently do not use any cross-site
        tracking that DNT would affect, but we honor consent withdrawal via the cookie banner
        regardless of browser DNT state.
      </p>

      <h2>5. Changes</h2>
      <p>
        Material changes will be announced via the cookie banner re-appearing. Last updated {v}.
      </p>

      <h2>6. Contact</h2>
      <p>
        Questions:{" "}
        <a href={`mailto:${PROVIDER_IDENTITY.privacyEmail}`}>{PROVIDER_IDENTITY.privacyEmail}</a>.
      </p>
    </LegalShell>
  );
}
