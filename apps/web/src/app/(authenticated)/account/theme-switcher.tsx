"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckCircleIcon } from "@heroicons/react/20/solid";
import { setThemeAction } from "./profile-actions";
import { THEMES, THEME_LABELS, type Theme } from "@/lib/theme";

// Representative swatches per theme so each option previews its palette even
// while a different theme is active (CSS vars only reflect the active one).
const SWATCHES: Record<Theme, { bg: string; a: string; b: string; c: string; blurb: string }> = {
  editorial: {
    bg: "#f6f3eb",
    a: "#2d4a2e",
    b: "#d99550",
    c: "#8b9d83",
    blurb: "Warm cream surfaces, forest green, persimmon accent.",
  },
  bright: {
    bg: "#ffffff",
    a: "#0073ea",
    b: "#a25ddc",
    c: "#00c875",
    blurb: "Crisp white surfaces, vivid blue, purple + green accents.",
  },
};

export default function ThemeSwitcher({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);
  const [pending, startTransition] = useTransition();

  function applyTheme(next: Theme) {
    if (next === theme) return;
    const previous = theme;
    setTheme(next);
    // Instant visual feedback — flip the live theme immediately.
    const root = document.documentElement;
    if (next === "editorial") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", next);

    startTransition(async () => {
      const res = await setThemeAction(next);
      if (res.ok) {
        toast.success(`Theme set to ${THEME_LABELS[next]}`);
      } else {
        // Roll back the optimistic switch on failure.
        setTheme(previous);
        if (previous === "editorial") root.removeAttribute("data-theme");
        else root.setAttribute("data-theme", previous);
        toast.error(res.error.message);
      }
    });
  }

  return (
    <section className="border-border bg-background rounded-xl border p-5">
      <h2 className="text-foreground text-base font-bold">Appearance</h2>
      <p className="text-muted-foreground mt-1 text-xs">
        Choose how Arbor looks. Saved to your account and applied on every device you sign in on.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {THEMES.map((t) => {
          const sw = SWATCHES[t];
          const selected = t === theme;
          return (
            <button
              key={t}
              type="button"
              onClick={() => {
                applyTheme(t);
              }}
              disabled={pending}
              aria-pressed={selected}
              className={`relative flex flex-col gap-3 rounded-lg border p-4 text-left transition-colors disabled:opacity-60 ${
                selected
                  ? "border-primary ring-primary ring-1"
                  : "border-border hover:border-foreground/30"
              }`}
            >
              {selected && (
                <CheckCircleIcon className="text-primary absolute right-3 top-3 h-5 w-5" />
              )}
              {/* Palette preview */}
              <div
                className="flex h-12 items-center gap-2 rounded-md border px-3"
                style={{ backgroundColor: sw.bg, borderColor: "rgba(0,0,0,0.08)" }}
              >
                <Dot color={sw.a} />
                <Dot color={sw.b} />
                <Dot color={sw.c} />
              </div>
              <div>
                <p className="text-foreground text-sm font-semibold">{THEME_LABELS[t]}</p>
                <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">{sw.blurb}</p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="h-5 w-5 rounded-full"
      style={{ backgroundColor: color, boxShadow: "0 0 0 1px rgba(0,0,0,0.06)" }}
    />
  );
}
