import Link from "next/link";
import LegalDisclaimer from "./legal-disclaimer";
import LegalFooter from "./legal-footer";

/**
 * Shared layout for every legal document page. Wraps content in a
 * readable prose column, surfaces the draft-only disclaimer at the top,
 * and provides a back link to the legal index.
 */
export default function LegalShell({
  title,
  version,
  effectiveDate,
  children,
}: {
  title: string;
  version: string;
  effectiveDate: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-canvas min-h-screen">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Link href="/legal" className="text-muted-foreground hover:text-foreground text-xs">
          ← All legal documents
        </Link>
        <header className="border-border mb-6 mt-4 border-b pb-6">
          <h1 className="text-foreground text-3xl font-bold">{title}</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Version <code className="font-mono">{version}</code> · Effective {effectiveDate}
          </p>
        </header>
        <LegalDisclaimer />
        <article className="prose prose-slate dark:prose-invert text-foreground [&_code]:bg-surface mt-8 max-w-none text-sm leading-relaxed [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_h2]:mb-2 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-bold [&_h3]:mb-1 [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-semibold [&_ol]:my-3 [&_ol]:ml-6 [&_ol]:list-decimal [&_p]:my-3 [&_ul]:my-3 [&_ul]:ml-6 [&_ul]:list-disc">
          {children}
        </article>
      </div>
      <LegalFooter />
    </div>
  );
}
