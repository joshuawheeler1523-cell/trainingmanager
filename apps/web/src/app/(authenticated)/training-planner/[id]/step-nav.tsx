"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckCircleIcon } from "@heroicons/react/20/solid";

type Readiness = {
  setup: boolean;
  rooms: boolean;
  trainers: boolean;
  modules: boolean;
  classes: boolean;
  sessions: boolean;
};

type Props = { implementationId: string; readiness: Readiness };

const STEPS = [
  { slug: "setup", label: "1. Setup", readyKey: "setup" as const },
  { slug: "rooms", label: "2. Rooms", readyKey: "rooms" as const },
  { slug: "trainers", label: "3. Trainers", readyKey: "trainers" as const },
  { slug: "modules", label: "4. Modules", readyKey: "modules" as const },
  { slug: "classes", label: "5. Classes", readyKey: "classes" as const },
  { slug: "calculate", label: "6. Calculate", readyKey: null },
  { slug: "schedule", label: "7. Schedule", readyKey: "sessions" as const },
];

export default function StepNav({ implementationId, readiness }: Props) {
  const pathname = usePathname();
  return (
    <div className="border-border bg-background sticky top-0 z-10 border-b">
      <nav className="flex flex-wrap gap-x-1 px-4">
        {STEPS.map((s) => {
          const href = `/training-planner/${implementationId}/${s.slug}`;
          const active = pathname.endsWith(`/${s.slug}`);
          const ready = s.readyKey ? readiness[s.readyKey] : false;
          return (
            <Link
              key={s.slug}
              href={href}
              className={`flex items-center gap-1 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                active
                  ? "border-primary text-foreground"
                  : "text-muted-foreground hover:text-foreground border-transparent"
              }`}
            >
              <span>{s.label}</span>
              {ready && <CheckCircleIcon className="h-3.5 w-3.5 text-emerald-500" />}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
