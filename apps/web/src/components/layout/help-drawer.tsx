"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import {
  XMarkIcon,
  QuestionMarkCircleIcon,
  MagnifyingGlassIcon,
  ChevronLeftIcon,
} from "@heroicons/react/24/outline";
import { HELP_ARTICLES, searchHelp, suggestionsForRoute, type HelpArticle } from "@/help";

type Props = {
  open: boolean;
  onClose: () => void;
};

const SHORTCUTS = [
  { keys: "⌘K", label: "Open search" },
  { keys: "?", label: "Open help" },
  { keys: "⌘S", label: "Save (when form is focused)" },
];

export default function HelpDrawer({ open, onClose }: Props) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  const suggestions = useMemo(() => suggestionsForRoute(pathname), [pathname]);
  const results = useMemo(() => (query.trim() ? searchHelp(query) : null), [query]);

  const openArticle: HelpArticle | undefined = openSlug
    ? HELP_ARTICLES.find((a) => a.slug === openSlug)
    : undefined;

  function close() {
    onClose();
    // Reset to the index view next time it opens.
    setOpenSlug(null);
    setQuery("");
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        if (!v) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 fixed inset-0 z-40 bg-black/20" />
        <Dialog.Content className="border-border bg-background data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:animate-in data-[state=open]:slide-in-from-right fixed inset-y-0 right-0 z-50 flex w-96 flex-col border-l shadow-xl">
          <div className="border-border flex items-center justify-between border-b px-4 py-3">
            <Dialog.Title className="text-foreground flex items-center gap-2 text-sm font-semibold">
              {openArticle ? (
                <button
                  type="button"
                  onClick={() => {
                    setOpenSlug(null);
                  }}
                  className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                >
                  <ChevronLeftIcon className="h-4 w-4" />
                  Back
                </button>
              ) : (
                <>
                  <QuestionMarkCircleIcon className="h-4 w-4" />
                  Help
                </>
              )}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="text-muted-foreground hover:text-foreground rounded-md p-1"
                aria-label="Close help"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          {openArticle ? (
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <h2 className="text-foreground text-base font-semibold">{openArticle.title}</h2>
              <p className="text-muted-foreground mt-1 text-xs">{openArticle.summary}</p>
              <div className="text-foreground mt-4 text-sm leading-relaxed">
                {openArticle.render()}
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {/* Search */}
              <div className="border-input bg-background flex items-center gap-2 rounded-md border px-2 py-1.5">
                <MagnifyingGlassIcon className="text-muted-foreground h-4 w-4 shrink-0" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                  }}
                  placeholder="Search help…"
                  className="text-foreground placeholder:text-muted-foreground w-full bg-transparent text-sm focus:outline-none"
                />
              </div>

              {results ? (
                <Section title={`Results (${results.length.toString()})`}>
                  {results.length === 0 ? (
                    <p className="text-muted-foreground text-xs">No matches.</p>
                  ) : (
                    <ArticleList articles={results} onOpen={setOpenSlug} />
                  )}
                </Section>
              ) : (
                <>
                  <Section title="Suggested for this page">
                    <ArticleList articles={suggestions} onOpen={setOpenSlug} />
                  </Section>
                  <Section title="All articles">
                    <ArticleList articles={HELP_ARTICLES} onOpen={setOpenSlug} />
                  </Section>
                </>
              )}

              {/* Shortcuts (collapsed when an article is open) */}
              <Section title="Keyboard shortcuts">
                <div className="space-y-2 text-sm">
                  {SHORTCUTS.map(({ keys, label }) => (
                    <div key={keys} className="flex items-center justify-between">
                      <span className="text-muted-foreground">{label}</span>
                      <kbd className="border-border text-muted-foreground rounded border px-1.5 py-0.5 text-xs">
                        {keys}
                      </kbd>
                    </div>
                  ))}
                </div>
              </Section>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <h3 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
        {title}
      </h3>
      {children}
    </div>
  );
}

function ArticleList({
  articles,
  onOpen,
}: {
  articles: HelpArticle[];
  onOpen: (slug: string) => void;
}) {
  if (articles.length === 0) {
    return <p className="text-muted-foreground text-xs">No articles.</p>;
  }
  return (
    <ul className="border-border divide-border divide-y rounded-md border">
      {articles.map((a) => (
        <li key={a.slug}>
          <button
            type="button"
            onClick={() => {
              onOpen(a.slug);
            }}
            className="hover:bg-surface w-full px-3 py-2 text-left"
          >
            <p className="text-foreground text-sm font-medium">{a.title}</p>
            <p className="text-muted-foreground mt-0.5 text-xs">{a.summary}</p>
          </button>
        </li>
      ))}
    </ul>
  );
}
