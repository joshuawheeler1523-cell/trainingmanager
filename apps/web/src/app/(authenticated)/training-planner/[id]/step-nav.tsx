"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type Readiness = {
  setup: boolean;
  rooms: boolean;
  trainers: boolean;
  modules: boolean;
  classes: boolean;
  sessions: boolean;
};

type Props = { implementationId: string; readiness: Readiness };

type Step = {
  slug: string;
  label: string;
  readyKey: keyof Readiness | null;
};

type StepState = "done" | "current" | "upcoming";

// The 7-step wizard rail. Super Users is auxiliary (no step number, sits
// next to the rail as a trailing chip — matches the mock's pattern of
// keeping the main flow visually weighted and the side rails light.
const STEPS: Step[] = [
  { slug: "setup", label: "Setup", readyKey: "setup" },
  { slug: "rooms", label: "Rooms", readyKey: "rooms" },
  { slug: "trainers", label: "Trainers", readyKey: "trainers" },
  { slug: "modules", label: "Modules", readyKey: "modules" },
  { slug: "classes", label: "Classes", readyKey: "classes" },
  { slug: "calculate", label: "Calculate", readyKey: null },
  { slug: "schedule", label: "Schedule", readyKey: "sessions" },
];

const BAR: Record<StepState, string> = {
  done: "bg-[var(--forest)]",
  current: "bg-[var(--persimmon)]",
  upcoming: "bg-[var(--hair-soft,rgba(28,31,28,0.10))]",
};

export default function StepNav({ implementationId, readiness }: Props) {
  const pathname = usePathname();

  const activeIdx = STEPS.findIndex((s) => pathname.endsWith(`/${s.slug}`));
  const superUsersActive = pathname.endsWith("/super-users");
  const onboardingActive = pathname.endsWith("/onboarding");

  return (
    <div className="border-border bg-background sticky top-0 z-10 border-b px-6 py-3">
      <div className="flex items-end gap-6">
        <div className="min-w-0 flex-1">
          {/* Each step is a single clickable column — number, bar, and
              title share one large hit target so users don't have to aim
              at the 4px bar. Matches the editorial rail mock visually. */}
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: `repeat(${String(STEPS.length)}, minmax(0, 1fr))` }}
          >
            {STEPS.map((s, i) => {
              const ready = s.readyKey ? readiness[s.readyKey] : false;
              const state: StepState = activeIdx === i ? "current" : ready ? "done" : "upcoming";
              const isCurrent = state === "current";
              return (
                <Link
                  key={s.slug}
                  href={`/training-planner/${implementationId}/${s.slug}`}
                  aria-current={isCurrent ? "step" : undefined}
                  aria-label={`Step ${String(i + 1).padStart(2, "0")} — ${s.label}`}
                  className="hover:bg-surface group flex flex-col items-stretch gap-1.5 rounded-sm px-1 py-1 transition-colors"
                >
                  <span
                    className={cn(
                      "text-center font-mono text-[9px] uppercase leading-none tracking-[0.04em] transition-colors",
                      isCurrent
                        ? "font-medium text-[var(--persimmon-deep)]"
                        : "text-muted-foreground group-hover:text-foreground",
                    )}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span
                    aria-hidden
                    className={cn("h-1 rounded-sm transition-colors", BAR[state])}
                  />
                  <span
                    className={cn(
                      "truncate text-center font-mono text-[9.5px] uppercase leading-none tracking-[0.04em] transition-colors",
                      isCurrent
                        ? "font-medium text-[var(--persimmon-deep)]"
                        : "text-muted-foreground group-hover:text-foreground",
                    )}
                  >
                    {s.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Auxiliary entries — Super Users + Onboarding sit beside the rail
            as light mono chips rather than numbered steps. */}
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={`/training-planner/${implementationId}/super-users`}
            className={cn(
              "rounded-[3px] px-2.5 py-1.5 font-mono text-[10px] font-medium uppercase leading-none tracking-[0.06em] transition-colors",
              superUsersActive
                ? "bg-[var(--ink,var(--foreground))] text-[var(--cream,var(--background))]"
                : "bg-surface text-muted-foreground hover:text-foreground",
            )}
          >
            Super Users
          </Link>
          <Link
            href={`/training-planner/${implementationId}/onboarding`}
            className={cn(
              "rounded-[3px] px-2.5 py-1.5 font-mono text-[10px] font-medium uppercase leading-none tracking-[0.06em] transition-colors",
              onboardingActive
                ? "bg-[var(--ink,var(--foreground))] text-[var(--cream,var(--background))]"
                : "bg-surface text-muted-foreground hover:text-foreground",
            )}
          >
            Onboarding
          </Link>
        </div>
      </div>
    </div>
  );
}
