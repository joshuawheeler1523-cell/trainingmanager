"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { SectionRail, type SectionRailItem } from "@/components/ui";
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

export default function StepNav({ implementationId, readiness }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const activeIdx = STEPS.findIndex((s) => pathname.endsWith(`/${s.slug}`));
  const superUsersActive = pathname.endsWith("/super-users");

  const sections: SectionRailItem[] = STEPS.map((s, i) => {
    const ready = s.readyKey ? readiness[s.readyKey] : false;
    return {
      id: i + 1,
      label: s.label,
      state: activeIdx === i ? "current" : ready ? "done" : "upcoming",
    };
  });

  return (
    <div className="border-border bg-background sticky top-0 z-10 border-b px-6 py-3">
      <div className="flex items-end gap-6">
        <div className="min-w-0 flex-1">
          <SectionRail
            sections={sections}
            onSelect={(id) => {
              const step = STEPS[id - 1];
              if (step) {
                router.push(`/training-planner/${implementationId}/${step.slug}`);
              }
            }}
          />
          {/* Visible labels under the rail — match the mock's "step name"
              callouts below the numeric labels. Lit when current. */}
          <div
            className="mt-2 grid gap-1 font-mono text-[9.5px] uppercase leading-none tracking-[0.04em]"
            style={{ gridTemplateColumns: `repeat(${String(STEPS.length)}, minmax(0, 1fr))` }}
          >
            {STEPS.map((s, i) => (
              <Link
                key={s.slug}
                href={`/training-planner/${implementationId}/${s.slug}`}
                className={cn(
                  "hover:text-foreground truncate text-center transition-colors",
                  activeIdx === i
                    ? "font-medium text-[var(--persimmon-deep)]"
                    : "text-muted-foreground",
                )}
              >
                {s.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Auxiliary entry — Super Users sits beside the rail as a light
            mono chip rather than a numbered step. */}
        <Link
          href={`/training-planner/${implementationId}/super-users`}
          className={cn(
            "shrink-0 rounded-[3px] px-2.5 py-1.5 font-mono text-[10px] font-medium uppercase leading-none tracking-[0.06em] transition-colors",
            superUsersActive
              ? "bg-[var(--ink,var(--foreground))] text-[var(--cream,var(--background))]"
              : "bg-surface text-muted-foreground hover:text-foreground",
          )}
        >
          Super Users
        </Link>
      </div>
    </div>
  );
}
