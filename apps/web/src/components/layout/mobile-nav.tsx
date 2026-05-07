"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";
import { logout } from "@/app/(authenticated)/actions";

const PRIMARY_NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/instructors", label: "Instructors" },
  { href: "/classes", label: "Classes" },
  { href: "/skills", label: "Skills" },
  { href: "/allocations", label: "Allocations" },
] as const;

const SECONDARY_NAV = [
  { href: "/tras", label: "TRAs" },
  { href: "/request-queue", label: "Request Queue" },
  { href: "/projects", label: "Special Projects" },
  { href: "/training-planner", label: "Training Planner" },
  { href: "/reports", label: "Reports" },
] as const;

export default function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  function close() {
    setOpen(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          className="text-muted-foreground hover:bg-surface hover:text-foreground flex items-center rounded-md p-1.5 md:hidden"
          aria-label="Open navigation"
        >
          <Bars3Icon className="h-5 w-5" />
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="border-border bg-background data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:animate-in data-[state=open]:slide-in-from-left fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r shadow-xl">
          <Dialog.Title className="sr-only">Navigation</Dialog.Title>

          <div className="border-border flex items-center justify-between border-b px-4 py-3">
            <span className="text-foreground text-base font-semibold">Arbor</span>
            <Dialog.Close asChild>
              <button
                className="text-muted-foreground hover:text-foreground rounded-md p-1"
                aria-label="Close navigation"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </Dialog.Close>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Mobile navigation">
            <p className="text-muted-foreground mb-1 px-2 text-xs font-medium uppercase tracking-wider">
              Main
            </p>
            {PRIMARY_NAV.map(({ href, label }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={close}
                  className={cn(
                    "mb-0.5 flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-surface hover:text-foreground",
                  )}
                >
                  {label}
                </Link>
              );
            })}

            <p className="text-muted-foreground mb-1 mt-4 px-2 text-xs font-medium uppercase tracking-wider">
              Work
            </p>
            {SECONDARY_NAV.map(({ href, label }) => {
              const active = pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={close}
                  className={cn(
                    "mb-0.5 flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-surface hover:text-foreground",
                  )}
                >
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="border-border border-t px-3 py-3">
            <form action={logout}>
              <button
                type="submit"
                className="text-destructive hover:bg-surface flex w-full items-center rounded-md px-3 py-2 text-sm font-medium"
              >
                Sign Out
              </button>
            </form>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
