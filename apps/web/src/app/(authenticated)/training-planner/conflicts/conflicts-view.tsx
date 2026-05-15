"use client";

import { useMemo, useState } from "react";
import { ExclamationTriangleIcon } from "@heroicons/react/20/solid";
import type { ConflictPair, ConflictSide } from "./queries";
import ResolutionDrawer from "./resolution-drawer";

type Props = { pairs: ConflictPair[] };

// One pair, viewed from a chosen anchor side. `partnerSideKey` is the
// "a"/"b" of the PARTNER in the underlying pair — used so the Resolve
// button on a spoke opens the drawer targeting that side.
type AnchoredPair = {
  pair: ConflictPair;
  anchorSideKey: "a" | "b";
  partnerSideKey: "a" | "b";
  partner: ConflictSide;
};

type ConflictGroup = {
  anchor_session_id: string;
  anchor: ConflictSide;
  instructor_name: string;
  items: AnchoredPair[];
  earliest_overlap_start: string;
};

export default function ConflictsView({ pairs }: Props) {
  const [active, setActive] = useState<{ pair: ConflictPair; side: "a" | "b" } | null>(null);

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

  const groups = useMemo(() => groupPairsByAnchor(visiblePairs), [visiblePairs]);

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
        {groups.map((group) => {
          const first = group.items[0];
          if (!first) return null;
          if (group.items.length === 1) {
            return (
              <li key={first.pair.pair_key}>
                <SoloPairCard
                  pair={first.pair}
                  onResolve={(side) => {
                    setActive({ pair: first.pair, side });
                  }}
                />
              </li>
            );
          }
          return (
            <li key={`group:${group.anchor_session_id}`}>
              <HubAndSpokesCard
                group={group}
                onResolveAnchor={() => {
                  // Opening the drawer with any one pair works — the drawer
                  // targets the anchor's session id, which is consistent
                  // across every pair in the group.
                  setActive({ pair: first.pair, side: first.anchorSideKey });
                }}
                onResolvePartner={(item) => {
                  setActive({ pair: item.pair, side: item.partnerSideKey });
                }}
              />
            </li>
          );
        })}
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

// Pick the side that appears in more pairs as the "anchor" (hub).
// Tiebreak: earlier scheduled_start, then session_id for stability.
// One pair belongs to exactly one group.
function groupPairsByAnchor(pairs: ConflictPair[]): ConflictGroup[] {
  const degree = new Map<string, number>();
  for (const p of pairs) {
    degree.set(p.side_a.session_id, (degree.get(p.side_a.session_id) ?? 0) + 1);
    degree.set(p.side_b.session_id, (degree.get(p.side_b.session_id) ?? 0) + 1);
  }

  const groups = new Map<string, ConflictGroup>();
  for (const pair of pairs) {
    const aDeg = degree.get(pair.side_a.session_id) ?? 0;
    const bDeg = degree.get(pair.side_b.session_id) ?? 0;
    let anchorKey: "a" | "b";
    if (aDeg !== bDeg) {
      anchorKey = aDeg > bDeg ? "a" : "b";
    } else if (pair.side_a.scheduled_start !== pair.side_b.scheduled_start) {
      anchorKey = pair.side_a.scheduled_start < pair.side_b.scheduled_start ? "a" : "b";
    } else {
      anchorKey = pair.side_a.session_id < pair.side_b.session_id ? "a" : "b";
    }
    const anchor = anchorKey === "a" ? pair.side_a : pair.side_b;
    const partner = anchorKey === "a" ? pair.side_b : pair.side_a;
    const partnerKey: "a" | "b" = anchorKey === "a" ? "b" : "a";

    const existing = groups.get(anchor.session_id);
    if (existing) {
      existing.items.push({ pair, anchorSideKey: anchorKey, partnerSideKey: partnerKey, partner });
      if (pair.overlap_start < existing.earliest_overlap_start) {
        existing.earliest_overlap_start = pair.overlap_start;
      }
    } else {
      groups.set(anchor.session_id, {
        anchor_session_id: anchor.session_id,
        anchor,
        instructor_name: pair.instructor_name,
        items: [{ pair, anchorSideKey: anchorKey, partnerSideKey: partnerKey, partner }],
        earliest_overlap_start: pair.overlap_start,
      });
    }
  }

  // Sort each group's spokes chronologically by overlap start.
  for (const g of groups.values()) {
    g.items.sort((x, y) => x.pair.overlap_start.localeCompare(y.pair.overlap_start));
  }

  return [...groups.values()].sort((x, y) =>
    x.earliest_overlap_start.localeCompare(y.earliest_overlap_start),
  );
}

function SoloPairCard({
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
        <SideCard
          side={pair.side_a}
          resolveLabel="Resolve — move this →"
          onResolve={() => {
            onResolve("a");
          }}
        />
        <SideCard
          side={pair.side_b}
          resolveLabel="Resolve — move this →"
          onResolve={() => {
            onResolve("b");
          }}
        />
      </div>
    </div>
  );
}

function HubAndSpokesCard({
  group,
  onResolveAnchor,
  onResolvePartner,
}: {
  group: ConflictGroup;
  onResolveAnchor: () => void;
  onResolvePartner: (item: AnchoredPair) => void;
}) {
  const n = group.items.length;
  const anchorDate = formatDateOnly(group.anchor.scheduled_start);
  const clearsLabel = n === 2 ? "clears both conflicts" : `clears all ${n.toString()} conflicts`;
  return (
    <div className="border-border bg-background overflow-hidden rounded-xl border">
      <div className="border-border flex items-center gap-2 border-b bg-amber-50/60 px-4 py-2 dark:bg-amber-950/20">
        <ExclamationTriangleIcon className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <div className="text-foreground text-sm">
          <span className="font-semibold">{group.instructor_name}</span>{" "}
          <span className="text-muted-foreground">·</span>{" "}
          <span className="font-medium">{n.toString()} overlapping sessions</span>{" "}
          <span className="text-muted-foreground">on {anchorDate}</span>
        </div>
      </div>

      <div className="border-border border-b p-4">
        <p className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
          {group.anchor.implementation_name}
        </p>
        <p className="text-foreground mt-0.5 text-sm font-semibold">{group.anchor.class_name}</p>
        <p className="text-muted-foreground mt-1 text-xs tabular-nums">
          {formatRange(group.anchor.scheduled_start, group.anchor.scheduled_end)}
        </p>
        <p className="text-muted-foreground mt-1 text-xs">
          {group.anchor.room_name ?? "Unassigned room"}
          {group.anchor.learners_count != null &&
            ` · ${group.anchor.learners_count.toString()} learners`}
        </p>
        <button
          type="button"
          onClick={onResolveAnchor}
          className="bg-primary text-primary-foreground hover:bg-primary/90 mt-3 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium"
        >
          Resolve — move this, {clearsLabel} →
        </button>
      </div>

      <div className="px-4 pb-4 pt-3">
        <p className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
          Overlaps with
        </p>
        <ul className="border-border divide-border bg-surface mt-2 divide-y overflow-hidden rounded-lg border">
          {group.items.map((item) => (
            <li key={item.pair.pair_key} className="p-3">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-foreground text-xs font-semibold tabular-nums">
                  {formatTimeRange(item.pair.overlap_start, item.pair.overlap_end)}
                </span>
                <span className="text-muted-foreground text-[11px]">
                  ({item.pair.overlap_hours.toFixed(1)}h overlap)
                </span>
              </div>
              <p className="text-muted-foreground mt-1 text-[11px] font-medium uppercase tracking-wide">
                {item.partner.implementation_name}
              </p>
              <p className="text-foreground mt-0.5 text-sm font-semibold">
                {item.partner.class_name}
              </p>
              <p className="text-muted-foreground mt-1 text-xs tabular-nums">
                {formatRange(item.partner.scheduled_start, item.partner.scheduled_end)}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                {item.partner.room_name ?? "Unassigned room"}
                {item.partner.learners_count != null &&
                  ` · ${item.partner.learners_count.toString()} learners`}
              </p>
              <button
                type="button"
                onClick={() => {
                  onResolvePartner(item);
                }}
                className="border-border bg-background hover:bg-surface text-foreground mt-2 inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium"
              >
                Resolve — move this instead →
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function SideCard({
  side,
  resolveLabel,
  onResolve,
}: {
  side: ConflictSide;
  resolveLabel: string;
  onResolve: () => void;
}) {
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
        {resolveLabel}
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

function formatTimeRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const timeFmt: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  return `${start.toLocaleTimeString(undefined, timeFmt)}–${end.toLocaleTimeString(undefined, timeFmt)}`;
}

function formatDateOnly(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
