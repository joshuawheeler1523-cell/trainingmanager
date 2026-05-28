"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowUturnLeftIcon } from "@heroicons/react/20/solid";
import type { ImplClass } from "@arbor/shared";
import { updateClassColor } from "../../actions";
import { CLASS_PALETTE, colorForClass } from "./class-palette";

type Props = {
  implementationId: string;
  classes: ImplClass[];
};

export default function ClassColorLegend({ implementationId, classes }: Props) {
  const [pending, startTransition] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);

  // Optimistic local state so swatches re-color instantly on pick before
  // the router refetches. Keyed by class id → color (or null = default).
  const [overrides, setOverrides] = useState<Record<string, string | null>>({});

  function resolveColor(c: ImplClass): string {
    const override = overrides[c.id];
    if (override !== undefined) {
      return override ?? colorForClass(c.id);
    }
    return c.color ?? colorForClass(c.id);
  }

  function pickColor(c: ImplClass, color: string | null) {
    setOverrides((prev) => ({ ...prev, [c.id]: color }));
    setOpenId(null);
    startTransition(async () => {
      const result = await updateClassColor(c.id, implementationId, color);
      if (!result.ok) {
        toast.error(result.error.message);
        setOverrides((prev) => {
          // Use object-rest to drop this key without dynamic delete.
          const { [c.id]: _dropped, ...rest } = prev;
          void _dropped;
          return rest;
        });
      }
    });
  }

  if (classes.length === 0) return null;

  return (
    <details className="border-border bg-background rounded-xl border">
      <summary className="text-muted-foreground hover:bg-surface/50 cursor-pointer list-none px-3 py-2 text-[11px] font-medium uppercase tracking-wide">
        Class colors{" "}
        <span className="text-muted-foreground/60 normal-case">
          · click a swatch to change ({classes.length} classes)
        </span>
      </summary>
      <div className="border-border flex flex-wrap items-center gap-1.5 border-t p-2">
        {classes.map((c) => (
          <ClassSwatchButton
            key={c.id}
            className={c.name}
            color={resolveColor(c)}
            disabled={pending}
            isOpen={openId === c.id}
            onOpen={() => {
              setOpenId(openId === c.id ? null : c.id);
            }}
            onClose={() => {
              setOpenId(null);
            }}
            onPick={(color) => {
              pickColor(c, color);
            }}
            onReset={() => {
              pickColor(c, null);
            }}
          />
        ))}
      </div>
    </details>
  );
}

function ClassSwatchButton({
  className,
  color,
  disabled,
  isOpen,
  onOpen,
  onClose,
  onPick,
  onReset,
}: {
  className: string;
  color: string;
  disabled: boolean;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onPick: (hex: string) => void;
  onReset: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Close popover on outside click.
  useEffect(() => {
    if (!isOpen) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
    };
  }, [isOpen, onClose]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={onOpen}
        disabled={disabled}
        className="border-border bg-background hover:bg-surface inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] disabled:opacity-50"
        title="Click to change color"
      >
        <span
          aria-hidden="true"
          className="border-border h-3 w-3 shrink-0 rounded-sm border"
          style={{ backgroundColor: color }}
        />
        <span className="text-foreground max-w-[10rem] truncate">{className}</span>
      </button>
      {isOpen && (
        <div className="border-border bg-background absolute left-0 top-full z-30 mt-1 w-[200px] rounded-md border p-2 shadow-lg">
          <p className="text-muted-foreground mb-1.5 text-[10px] font-medium uppercase tracking-wide">
            Pick a color
          </p>
          <div className="grid grid-cols-6 gap-1.5">
            {CLASS_PALETTE.map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => {
                  onPick(hex);
                }}
                className={`border-border h-6 w-6 rounded border transition-transform hover:scale-110 ${
                  color === hex ? "ring-foreground ring-2 ring-offset-1" : ""
                }`}
                style={{ backgroundColor: hex }}
                title={hex}
              />
            ))}
          </div>
          <div className="border-border mt-2 flex items-center justify-between gap-2 border-t pt-2">
            <label className="text-muted-foreground inline-flex items-center gap-1.5 text-[10px]">
              Custom
              <input
                type="color"
                onChange={(e) => {
                  onPick(e.target.value);
                }}
                className="border-border h-5 w-7 cursor-pointer rounded border"
              />
            </label>
            <button
              type="button"
              onClick={onReset}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 text-[10px]"
              title="Reset to default palette"
            >
              <ArrowUturnLeftIcon className="h-3 w-3" />
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
