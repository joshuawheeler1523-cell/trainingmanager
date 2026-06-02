"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircleIcon, ExclamationTriangleIcon, XCircleIcon } from "@heroicons/react/20/solid";
import type { Recommendation } from "@arbor/shared";

type Props = {
  title: string;
  recommendations: Recommendation[];
  emptyMessage?: string;
  showWhenEmpty?: boolean;
  defaultExpanded?: boolean;
};

export default function RecommendationsBanner({
  title,
  recommendations,
  emptyMessage,
  showWhenEmpty = false,
  defaultExpanded = true,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (recommendations.length === 0) {
    if (!showWhenEmpty || !emptyMessage) return null;
    return (
      <div className="border-border bg-background flex items-center gap-2 rounded-xl border px-4 py-3">
        <CheckCircleIcon className="text-success h-5 w-5" />
        <p className="text-foreground text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <section className="border-border bg-background rounded-xl border">
      <button
        type="button"
        onClick={() => {
          setExpanded((v) => !v);
        }}
        className="hover:bg-surface flex w-full items-center justify-between px-4 py-3"
      >
        <span className="text-foreground text-sm font-semibold">
          {title} ({recommendations.length})
        </span>
        <span className="text-muted-foreground text-xs">{expanded ? "Hide" : "Show"}</span>
      </button>
      {expanded && (
        <ul className="divide-border border-border divide-y border-t">
          {recommendations.map((r) => {
            const Icon = r.severity === "critical" ? XCircleIcon : ExclamationTriangleIcon;
            const iconCls = r.severity === "critical" ? "text-destructive" : "text-warning";
            return (
              <li key={r.id} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${iconCls}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground text-sm font-medium">{r.title}</p>
                    <p className="text-muted-foreground mt-0.5 text-xs">{r.body}</p>
                    {r.link && (
                      <Link
                        href={r.link}
                        className="text-primary mt-1.5 inline-block text-xs font-medium hover:underline"
                      >
                        Open →
                      </Link>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
