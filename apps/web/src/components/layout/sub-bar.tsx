"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const SECONDARY_NAV = [
  { href: "/tras", label: "TRAs" },
  { href: "/request-queue", label: "Request Queue" },
  { href: "/projects", label: "Special Projects" },
  { href: "/training-planner", label: "Training Planner" },
  { href: "/reports", label: "Reports" },
] as const;

export default function SubBar() {
  const pathname = usePathname();

  return (
    <div className="border-border bg-surface border-b">
      <div className="mx-auto flex h-9 max-w-screen-2xl items-center gap-1 overflow-x-auto px-4">
        {SECONDARY_NAV.map(({ href, label }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
