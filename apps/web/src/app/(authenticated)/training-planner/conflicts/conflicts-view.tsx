"use client";

import { useMemo, useState } from "react";
import { ExclamationTriangleIcon } from "@heroicons/react/20/solid";
import type { ConflictPair, ConflictSide } from "./queries";
import ResolutionDrawer from "./resolution-drawer";

type Props = { pairs: ConflictPair[] };

export default function ConflictsView({ pairs }: Props) {
  // Which side of which pair the planner is currently resolving.
  // Null = drawer closed.
  const [active, setActive] = useState<{ pair: ConflictPair; side: "a" | "b" } | null>(null);

  // Unique impls in play — for the optional filter chips at the top.
  const implsInPlay = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of pairs) {
      if (!seen.has(p.side_a.implementation_id)) {
        seen.set(p.side_a.implementation_id, p.side_a.implementation_name);
      }
      if (!seen.has(p.side_b.implementation_id)) {
        seen.set(p.side_b.implementation_id, p.side_b.implementation_name);
      }
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [pairs]);

  const [filterImpls, setFilterImpls] = useState<Set<string>>(new Set());

  const visiblePairs = useMemo(() => {
    if (filterImpls.size === 0) return pairs;
    return pairs.filter(
      (p) =>
        filterImpls.has(p.side_a.implementation_id) || filterImpls.has(p.side_b.implementation_id),
    );
  }, [pairs, filterImpls]);

  function toggleImpl(id: string) {
    const next = new Set(filterImpls);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setFilterImpls(next);
  }

  return (
    <div className="space-y-4">
      <div className="border-border bg-background flex flex-wrap items-baseline gap-3 rounded-lg border p-3">
        <span className="text-foreground text-sm font-semibold">
          {pairs.length.toString()} conflict{pairs.length === 1 ? "" : "s"}
        </span>
        {implsInPlay.length > 2 && (
          <>
            <span className="text-muted-foreground text-xs">Filter:</span>
            {implsInPlay.map((i) => {
              const active = filterImpls.has(i.id);
              return (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => {
                    toggleImpl(i.id);
                  }}
                  className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:bg-surface"
                  }`}
                >
                  {i.name}
                </button>
              );
            })}
          </>
        )}
      </div>

      <ul className="space-y-3">
        {visiblePairs.map((pair) => (
          <li key={pair.pair_key}>
            <ConflictCard
              pair={pair}
              onResolve={(side) => {
                setActive({ pair, side });
              }}
            />
          </li>
        ))}
      </ul>

      {active && (
        <ResolutionDrawer
          pair={active.pair}
          side={active.side}
          onClose={() => {
            setActive(null);
          }}
        />
      )}
    </div>
  );
}

function ConflictCard({
  pair,
  onResolve,
}: {
  pair: ConflictPair;
  onResolve: (side: "a" | "b") => void;
}) {
  return (
    <div className="border-border bg-background overflow-hidden rounded-xl border">
      <div className="border-border flex items-center gap-2 border-b bg-amber-50/60 px-4 py-2 dark:bg-amber-950/20">
        <ExclamationTriangleIcon className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <div className="text-foreground text-sm">
          <span className="font-semibold">{pair.instructor_name}</span>{" "}
          <span className="text-muted-foreground">double-booked ·</span>{" "}
          <span className="font-medium tabular-nums">
            {formatRange(pair.overlap_start, pair.overlap_end)}
          </span>{" "}
          <span className="text-muted-foreground">({pair.overlap_hours.toFixed(1)}h overlap)</span>
        </div>
      </div>
      <div className="bg-border grid grid-cols-1 gap-px sm:grid-cols-2">
        <Side
          side={pair.side_a}
          onResolve={() => {
            onResolve("a");
          }}
        />
        <Side
          side={pair.side_b}
          onResolve={() => {
            onResolve("b");
          }}
        />
      </div>
    </div>
  );
}

function Side({ side, onResolve }: { side: ConflictSide; onResolve: () => void }) {
  return (
    <div className="bg-background p-4">
      <p className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
        {side.implementation_name}
      </p>
      <p className="text-foreground mt-0.5 text-sm font-semibold">{side.class_name}</p>
      <p className="text-muted-foreground mt-1 text-xs tabular-nums">
        {formatRange(side.scheduled_start, side.scheduled_end)}
      </p>
      <p className="text-muted-foreground mt-1 text-xs">
        {side.room_name ?? "Unassigned room"}
        {side.learners_count != null && ` · ${side.learners_count.toString()} learners`}
      </p>
      <button
        type="button"
        onClick={onResolve}
        className="bg-primary text-primary-foreground hover:bg-primary/90 mt-3 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium"
      >
        Resolve — move this →
      </button>
    </div>
  );
}

function formatRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  const dateFmt: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
  };
  const timeFmt: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  if (sameDay) {
    return `${start.toLocaleDateString(undefined, dateFmt)} · ${start.toLocaleTimeString(undefined, timeFmt)}–${end.toLocaleTimeString(undefined, timeFmt)}`;
  }
  return `${start.toLocaleDateString(undefined, dateFmt)} ${start.toLocaleTimeString(undefined, timeFmt)} → ${end.toLocaleDateString(undefined, dateFmt)} ${end.toLocaleTimeString(undefined, timeFmt)}`;
}
