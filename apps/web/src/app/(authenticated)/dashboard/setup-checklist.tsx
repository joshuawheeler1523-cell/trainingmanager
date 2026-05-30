"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircleIcon, ArrowRightIcon, XMarkIcon } from "@heroicons/react/20/solid";
import { Eyebrow } from "@/components/ui";

type Props = {
  hasMembers: boolean; // > 1 (you + at least one teammate)
  hasInstructors: boolean;
  hasDepartments: boolean; // > 1 (more than just "General")
  hasClasses: boolean;
};

// Renders only when the org looks newly-provisioned (most things still empty).
// Hides itself when (a) every step is complete OR (b) the current user
// dismissed it via the × button. Dismissal is per-browser (localStorage);
// clear that key or use a fresh browser to bring it back.
const DISMISS_KEY = "arbor:dashboard:setup-checklist:dismissed";

export default function SetupChecklist(props: Props) {
  const items: { label: string; href: string; done: boolean; help: string }[] = [
    {
      label: "Invite your team",
      href: "/admin/team",
      done: props.hasMembers,
      help: "Send invite emails so managers and instructors can sign in.",
    },
    {
      label: "Add departments",
      href: "/admin/departments",
      done: props.hasDepartments,
      help: "Group instructors and work by unit. Every org starts with one 'General' department.",
    },
    {
      label: "Add instructors",
      href: "/instructors",
      done: props.hasInstructors,
      help: "These are the people whose capacity you're planning. Doesn't require them to have an Arbor sign-in.",
    },
    {
      label: "Create classes",
      href: "/classes",
      done: props.hasClasses,
      help: "Your training catalog. Each class can be scheduled inside a training plan.",
    },
  ];

  const allDone = items.every((i) => i.done);

  // Dismissal is client-side only — localStorage isn't available during SSR,
  // so we render the checklist on the server and hide it on the client right
  // after hydration if the user dismissed it. Brief flash on first paint is
  // accepted in exchange for not needing a cookie or DB roundtrip.
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(DISMISS_KEY) === "1") setDismissed(true);
  }, []);

  function handleDismiss() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DISMISS_KEY, "1");
    }
    setDismissed(true);
  }

  if (allDone || dismissed) return null;

  const doneCount = items.filter((i) => i.done).length;

  return (
    <section className="relative rounded-xl border border-[rgba(45,74,46,0.20)] bg-[rgba(45,74,46,0.04)] p-5">
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss setup checklist"
        title="Dismiss"
        className="text-muted-foreground hover:bg-surface hover:text-foreground absolute right-3 top-3 rounded-md p-1"
      >
        <XMarkIcon className="h-4 w-4" />
      </button>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3 pr-8">
        <div>
          <Eyebrow className="mb-1.5">Setup</Eyebrow>
          <h2 className="font-display text-foreground text-lg font-medium leading-tight tracking-[-0.005em]">
            Get your workspace set up.
          </h2>
        </div>
        <span className="text-muted-foreground font-mono text-[10.5px] uppercase tracking-[0.04em]">
          <b className="text-foreground font-medium tabular-nums">
            {doneCount} / {items.length}
          </b>{" "}
          complete
        </span>
      </div>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="border-border bg-background hover:bg-surface flex items-start gap-3 rounded-lg border p-3 transition-colors"
            >
              <CheckCircleIcon
                className={`mt-0.5 h-5 w-5 shrink-0 ${
                  item.done ? "text-[var(--forest)]" : "text-muted-foreground/30"
                }`}
              />
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-medium ${
                    item.done ? "text-muted-foreground line-through" : "text-foreground"
                  }`}
                >
                  {item.label}
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs">{item.help}</p>
              </div>
              {!item.done && (
                <ArrowRightIcon className="text-muted-foreground mt-1 h-4 w-4 shrink-0" />
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
