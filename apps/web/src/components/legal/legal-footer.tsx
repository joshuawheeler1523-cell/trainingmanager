import Link from "next/link";

/**
 * Compact legal footer surfaced on public/auth pages (login, signup,
 * /legal/*, /trust). Authenticated app pages already have their own
 * shell chrome and don't need this — but adding it there is harmless.
 */
export default function LegalFooter() {
  return (
    <footer className="border-border text-muted-foreground border-t py-4 text-center text-xs">
      <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <Link href="/legal/terms" className="hover:text-foreground">
          Terms
        </Link>
        <Link href="/legal/privacy" className="hover:text-foreground">
          Privacy
        </Link>
        <Link href="/legal/cookies" className="hover:text-foreground">
          Cookies
        </Link>
        <Link href="/legal/dpa" className="hover:text-foreground">
          DPA
        </Link>
        <Link href="/legal/baa" className="hover:text-foreground">
          BAA
        </Link>
        <Link href="/legal/aup" className="hover:text-foreground">
          AUP
        </Link>
        <Link href="/legal/sla" className="hover:text-foreground">
          SLA
        </Link>
        <Link href="/legal/subprocessors" className="hover:text-foreground">
          Subprocessors
        </Link>
        <Link href="/trust" className="hover:text-foreground">
          Trust
        </Link>
      </nav>
    </footer>
  );
}
