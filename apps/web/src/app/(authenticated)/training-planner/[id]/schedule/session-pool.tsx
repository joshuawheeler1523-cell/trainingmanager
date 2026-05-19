"use client";

import { useMemo, useState, type DragEvent } from "react";
import {
  ArrowUturnLeftIcon,
  CheckCircleIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/20/solid";
import type { ImplClass, ImplSession } from "@arbor/shared";
import { resolveClassColor } from "./class-palette";
import { setActivePoolDrag } from "./active-pool-drag";

type Props = {
  classes: ImplClass[];
  /** All sessions for this impl (any status except cancelled count toward placed). */
  sessions: ImplSession[];
  /** Called when the user drags a placed session back onto the pool. The
   *  caller is responsible for invoking unplaceManualSession + toast. */
  onUnplaceSession?: (sessionId: string) => void;
};

type PoolItem = {
  classId: string;
  className: string;
  color: string;
  hoursPerSession: number;
  learnersPerSession: number;
  required: number;
  placed: number;
  remaining: number;
};

// Payload that a pool token writes to dataTransfer on drag-start. Grid cells
// inspect `kind` to decide whether to treat the drop as a new placement (pool)
// or a move (placed-session). Keep this type stable — it's the wire format.
export type PoolDragPayload = {
  kind: "pool";
  classId: string;
  className: string;
  hoursPerSession: number;
  learnersPerSession: number;
  /** Duration in MINUTES for grid-cell math; matches the existing move payload. */
  durationMin: number;
};

function buildPoolItems(classes: ImplClass[], sessions: ImplSession[]): PoolItem[] {
  const placedByClass = new Map<string, number>();
  for (const s of sessions) {
    if (s.status === "cancelled") continue;
    placedByClass.set(s.impl_class_id, (placedByClass.get(s.impl_class_id) ?? 0) + 1);
  }

  const items: PoolItem[] = classes.map((c) => {
    const required = Math.max(
      0,
      Math.ceil(c.total_people_to_train / Math.max(c.expected_learners_per_session, 1)),
    );
    const placed = placedByClass.get(c.id) ?? 0;
    const remaining = Math.max(0, required - placed);
    return {
      classId: c.id,
      className: c.name,
      color: resolveClassColor(c.id, c.color ?? null),
      hoursPerSession: c.hours_per_session,
      learnersPerSession: c.expected_learners_per_session,
      required,
      placed,
      remaining,
    };
  });
  // Outstanding work first; completed classes drop to the bottom in their original order.
  items.sort((a, b) => {
    if (a.remaining > 0 && b.remaining === 0) return -1;
    if (a.remaining === 0 && b.remaining > 0) return 1;
    return 0;
  });
  return items;
}

export default function SessionPool({ classes, sessions, onUnplaceSession }: Props) {
  const items = useMemo(() => buildPoolItems(classes, sessions), [classes, sessions]);
  const [search, setSearch] = useState("");
  const [dropHover, setDropHover] = useState(false);

  function onZoneDragOver(e: DragEvent<HTMLDivElement>) {
    // Only react to JSON drags coming from a placed session (move-drag). Pool
    // chips publish `kind: 'pool'` via active-pool-drag; if that's set we're
    // looking at a pool-to-grid drag and should ignore the zone.
    const isJson = Array.from(e.dataTransfer.types).includes("application/json");
    if (!isJson) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!dropHover) setDropHover(true);
  }

  function onZoneDragLeave() {
    if (dropHover) setDropHover(false);
  }

  function onZoneDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDropHover(false);
    if (!onUnplaceSession) return;
    const payload = e.dataTransfer.getData("application/json");
    if (!payload) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== "object") return;
    const obj = parsed as { kind?: string; sessionId?: string };
    if (obj.kind === "pool") return; // own chip dragged back, ignore
    if (typeof obj.sessionId !== "string") return;
    onUnplaceSession(obj.sessionId);
  }

  const totalRequired = items.reduce((a, b) => a + b.required, 0);
  const totalPlaced = items.reduce((a, b) => a + b.placed, 0);
  const totalRemaining = items.reduce((a, b) => a + b.remaining, 0);
  const pct = totalRequired === 0 ? 0 : Math.round((totalPlaced / totalRequired) * 100);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.className.toLowerCase().includes(q));
  }, [items, search]);

  const allDone = totalRequired > 0 && totalRemaining === 0;

  return (
    <aside className="border-border bg-background sticky top-4 flex max-h-[calc(100vh-6rem)] w-72 shrink-0 flex-col overflow-hidden rounded-xl border">
      <div className="border-border space-y-2 border-b px-3 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-foreground font-serif text-sm tracking-tight">Session pool</h3>
          <span className="text-muted-foreground text-[10px] uppercase tracking-wide">
            {pct.toString()}% placed
          </span>
        </div>
        <ProgressBar pct={pct} />
        <p className="text-muted-foreground text-[11px] tabular-nums">
          <span className="text-foreground font-semibold">{totalRemaining.toString()}</span> of{" "}
          {totalRequired.toString()} sessions remaining
        </p>
      </div>

      {allDone ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-8 text-center">
          <CheckCircleIcon className="h-10 w-10 text-emerald-500 dark:text-emerald-400" />
          <p className="text-foreground text-sm font-semibold">All sessions placed</p>
          <p className="text-muted-foreground text-[11px] leading-snug">
            The pool is empty. Use “Publish drafts” above to lock the schedule.
          </p>
        </div>
      ) : (
        <>
          <div className="border-border border-b px-3 py-2">
            <label className="relative block">
              <MagnifyingGlassIcon className="text-muted-foreground absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                }}
                placeholder="Search classes…"
                className="border-input bg-background text-foreground placeholder:text-muted-foreground w-full rounded-md border py-1.5 pl-7 pr-2 text-xs"
              />
            </label>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto px-2 py-2">
            {filtered.length === 0 ? (
              <p className="text-muted-foreground px-2 py-4 text-center text-[11px]">
                No classes match “{search}”.
              </p>
            ) : (
              filtered.map((item) => <PoolCard key={item.classId} item={item} />)
            )}
          </div>

          <p className="border-border text-muted-foreground border-t px-3 py-2 text-[10.5px] leading-snug">
            Drag any chip onto an empty grid cell to schedule it. Conflicts are blocked at the drop.
          </p>
        </>
      )}

      {onUnplaceSession && (
        <div
          onDragOver={onZoneDragOver}
          onDragLeave={onZoneDragLeave}
          onDrop={onZoneDrop}
          className={`border-border flex items-center justify-center gap-1.5 border-t border-dashed px-3 py-2 text-[10.5px] font-medium transition-colors ${
            dropHover
              ? "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
              : "text-muted-foreground"
          }`}
          aria-label="Drop a placed session here to remove it"
        >
          <ArrowUturnLeftIcon className="h-3 w-3" />
          {dropHover ? "Release to remove from schedule" : "Drop a placed session here to remove"}
        </div>
      )}
    </aside>
  );
}

function PoolCard({ item }: { item: PoolItem }) {
  const done = item.remaining === 0;
  if (done) {
    return (
      <div className="border-border bg-surface/50 flex items-baseline gap-2 rounded-md border px-2.5 py-1.5">
        <span
          aria-hidden
          className="block h-3 w-1 shrink-0 rounded-sm"
          style={{ backgroundColor: item.color }}
        />
        <span className="text-muted-foreground flex-1 truncate text-[11px] line-through">
          {item.className}
        </span>
        <CheckCircleIcon className="h-3.5 w-3.5 shrink-0 text-emerald-500 dark:text-emerald-400" />
      </div>
    );
  }

  const chips = Array.from({ length: item.remaining }, (_, i) => i);

  return (
    <div className="border-border bg-background relative overflow-hidden rounded-md border">
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: item.color }}
      />
      <div className="space-y-1.5 py-2 pl-2.5 pr-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-foreground truncate text-[12px] font-medium leading-tight">
            {item.className}
          </p>
          <span className="text-muted-foreground shrink-0 text-[10px] tabular-nums">
            {item.remaining.toString()} of {item.required.toString()}
          </span>
        </div>
        <p className="text-muted-foreground text-[10px] tabular-nums">
          {item.hoursPerSession.toString()}h · {item.learnersPerSession.toString()} learners
        </p>
        <div className="flex flex-wrap gap-1 pt-0.5">
          {chips.map((i) => (
            <PoolChip key={i} item={item} indexInRemaining={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

function PoolChip({ item, indexInRemaining }: { item: PoolItem; indexInRemaining: number }) {
  function onDragStart(e: DragEvent<HTMLButtonElement>) {
    const payload: PoolDragPayload = {
      kind: "pool",
      classId: item.classId,
      className: item.className,
      hoursPerSession: item.hoursPerSession,
      learnersPerSession: item.learnersPerSession,
      durationMin: Math.round(item.hoursPerSession * 60),
    };
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("application/json", JSON.stringify(payload));
    // Anchor the drag image near the cursor's top-left, matching the move
    // anchor in grid-schedule-view so pre-drop preview lines up with where
    // the block will actually land.
    e.dataTransfer.setDragImage(e.currentTarget, 4, 4);
    // Publish to the module-level signal so grid cells can read the class
    // id during dragOver — dataTransfer payload bytes are hidden until drop.
    setActivePoolDrag(payload);
  }

  function onDragEnd() {
    setActivePoolDrag(null);
  }

  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      title={`Drag ${item.className} session #${(indexInRemaining + 1).toString()} onto the grid`}
      className="border-border/60 text-foreground hover:ring-primary/40 inline-flex cursor-grab items-center justify-center rounded-md border px-2 py-1 text-[10px] font-semibold tabular-nums hover:ring-2 active:cursor-grabbing"
      style={{ backgroundColor: item.color }}
    >
      {item.hoursPerSession.toString()}h
    </button>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div
      className="bg-surface relative h-1.5 w-full overflow-hidden rounded-full"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="bg-primary absolute inset-y-0 left-0 transition-[width]"
        style={{ width: `${pct.toString()}%` }}
      />
    </div>
  );
}
