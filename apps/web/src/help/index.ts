// Help-center registry. Each article is plain TSX content with a small
// frontmatter wrapper. Search is naive substring across title/summary/keywords.
// Route-aware suggestions are a `Map<routePrefix, slug[]>` lookup.

import type { ReactNode } from "react";
import { gettingStarted } from "./articles/getting-started";
import { addingInstructors } from "./articles/adding-instructors";
import { settingUpAllocations } from "./articles/setting-up-allocations";
import { creatingFirstTra } from "./articles/creating-your-first-tra";
import { planningImplementation } from "./articles/planning-an-implementation";

export type HelpArticle = {
  slug: string;
  title: string;
  summary: string;
  // Free-text keywords to widen search hits beyond title + summary.
  keywords: string[];
  // Body is a render function so the registry can stay a pure data file
  // (no React imports leak into search code paths).
  render(): ReactNode;
};

export const HELP_ARTICLES: HelpArticle[] = [
  gettingStarted,
  addingInstructors,
  settingUpAllocations,
  creatingFirstTra,
  planningImplementation,
];

// Naive substring search. Two-stage relevance: title match wins over
// summary/keywords. Returns articles in descending relevance, capped at 8.
export function searchHelp(query: string): HelpArticle[] {
  const q = query.trim().toLowerCase();
  if (!q) return HELP_ARTICLES.slice(0, 8);

  const scored = HELP_ARTICLES.map((a) => {
    const inTitle = a.title.toLowerCase().includes(q);
    const inSummary = a.summary.toLowerCase().includes(q);
    const inKeywords = a.keywords.some((k) => k.toLowerCase().includes(q));
    let score = 0;
    if (inTitle) score += 3;
    if (inSummary) score += 2;
    if (inKeywords) score += 1;
    return { article: a, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((s) => s.article);
}

// Page-aware suggestions. Keys are URL prefixes; the longest matching prefix
// wins. Each article slug listed here is shown when the user opens Help on
// the matching route.
const ROUTE_TO_ARTICLES: { prefix: string; slugs: string[] }[] = [
  // Most specific first; the lookup picks the longest match.
  { prefix: "/training-planner", slugs: ["planning-an-implementation", "setting-up-allocations"] },
  { prefix: "/projects", slugs: ["creating-your-first-tra", "planning-an-implementation"] },
  { prefix: "/tras", slugs: ["creating-your-first-tra", "setting-up-allocations"] },
  { prefix: "/allocations", slugs: ["setting-up-allocations", "adding-instructors"] },
  { prefix: "/instructors", slugs: ["adding-instructors", "setting-up-allocations"] },
  { prefix: "/", slugs: ["getting-started", "adding-instructors", "setting-up-allocations"] },
];

export function suggestionsForRoute(pathname: string): HelpArticle[] {
  const sorted = [...ROUTE_TO_ARTICLES].sort((a, b) => b.prefix.length - a.prefix.length);
  const match = sorted.find((r) => pathname.startsWith(r.prefix));
  const slugs = match?.slugs ?? ["getting-started"];
  const bySlug = new Map(HELP_ARTICLES.map((a) => [a.slug, a]));
  return slugs
    .map((s) => bySlug.get(s))
    .filter((a): a is HelpArticle => !!a)
    .slice(0, 3);
}

export function getArticle(slug: string): HelpArticle | null {
  return HELP_ARTICLES.find((a) => a.slug === slug) ?? null;
}
