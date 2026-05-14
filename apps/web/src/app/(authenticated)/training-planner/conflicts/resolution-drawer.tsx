"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { XMarkIcon, CheckIcon } from "@heroicons/react/20/solid";
import type { ConflictPair } from "./queries";
import { findAlternativeSlots, moveSession, type AlternativeSlot } from "./actions";

type Props = {
  pair: ConflictPair;
  side: "a" | "b";
  onClose: () => void;
};

export default function ResolutionDrawer({ pair, side, onClose }: Props) {
  const router = useRouter();
  const target = side === "a" ? pair.side_a : pair.side_b;
  const other = side === "a" ? pair.side_b : pair.side_a;

  const [loading, setLoading] = useState(true);
  const [alternatives, setAlternatives] = useState<AlternativeSlot[]>([]);
  const [pickIdx, setPickIdx] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const result = await findAlternativeSlots(target.session_id, 8);
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- closure-captured mutable flag flipped by cleanup
      if (cancelled) return;
      if (result.ok) {
        setAlternatives(result.data);
      } else {
        toast.error(result.error.message);
        setAlternatives([]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [target.session_id]);

  function handleMove() {
    if (pickIdx == null) return;
    const choice = alternatives[pickIdx];
    if (!choice) return;
    startTransition(async () => {
      const result = await moveSession(target.session_id, {
        scheduled_start: choice.scheduled_start,
        scheduled_end: choice.scheduled_end,
        impl_room_id: choice.impl_room_id,
        impl_trainer_id: choice.impl_trainer_id,
      });
      if (result.ok) {
        toast.success(`Moved · ${pair.instructor_name} is no longer double-booked`);
        router.refresh();
        onClose();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  // Esc closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="border-border bg-background flex w-full max-w-md flex-col border-l shadow-xl"
        onClick={(e) => {
          e.stopPropagation();
        }}
        role="dialog"
        aria-modal="true"
      >
        <div className="border-border flex items-start justify-between gap-3 border-b px-6 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
              Move this session
            </p>
            <h2 className="text-foreground mt-0.5 text-base font-semibold">{target.class_name}</h2>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {target.implementation_name} · {target.trainer_name}
            </p>
            <p className="text-muted-foreground mt-1 text-[11px]">
              Out of the way of <span className="font-medium">{other.class_name}</span> in{" "}
              <span className="font-medium">{other.implementation_name}</span>.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted-foreground hover:text-foreground rounded p-1"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <p className="text-muted-foreground text-sm italic">Finding alternative slots…</p>
          ) : alternatives.length === 0 ? (
            <div className="border-border bg-surface rounded-lg border border-dashed p-6 text-center">
              <p className="text-foreground text-sm font-medium">No alternative slots</p>
              <p className="text-muted-foreground mt-1 text-xs">
                No conflict-free slot exists for this session within the impl&apos;s window. Try
                resolving the OTHER side of the conflict instead, or widen the window / add a
                trainer.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {alternatives.map((a, i) => {
                const picked = pickIdx === i;
                return (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => {
                        setPickIdx(i);
                      }}
                      className={`w-full rounded-lg border p-3 text-left transition-colors ${
                        picked
                          ? "border-primary bg-primary/5"
                          : "border-border bg-background hover:bg-surface"
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-foreground text-sm font-medium tabular-nums">
                          {formatSlot(a.scheduled_start, a.scheduled_end)}
                        </span>
                        {picked && <CheckIcon className="text-primary h-4 w-4 shrink-0" />}
                      </div>
                      <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                        <span>{a.room_name}</span>
                        <span className="text-muted-foreground/50">·</span>
                        <span className={a.same_trainer ? "text-foreground font-medium" : ""}>
                          {a.trainer_name}
                          {a.same_trainer && " (same trainer)"}
                        </span>
                        <span className="text-muted-foreground/50">·</span>
                        <span className="tabular-nums">
                          {formatDistance(a.time_distance_hours)} from original
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-border flex items-center justify-end gap-2 border-t px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="text-muted-foreground hover:text-foreground rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleMove}
            disabled={pending || pickIdx == null || alternatives.length === 0}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            {pending ? "Moving…" : "Move session"}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatSlot(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const dateFmt: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
  };
  const timeFmt: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  return `${start.toLocaleDateString(undefined, dateFmt)} · ${start.toLocaleTimeString(undefined, timeFmt)}–${end.toLocaleTimeString(undefined, timeFmt)}`;
}

function formatDistance(hours: number): string {
  if (hours < 24) {
    return `${hours.toFixed(hours < 10 ? 1 : 0)}h`;
  }
  const days = Math.round(hours / 24);
  return `${days.toString()}d`;
}
