"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import {
  HomeIcon,
  UserGroupIcon,
  AcademicCapIcon,
  SparklesIcon,
  AdjustmentsHorizontalIcon,
  ClipboardDocumentListIcon,
  InboxStackIcon,
  BriefcaseIcon,
  CalendarDaysIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  Bars3Icon,
  XMarkIcon,
  ArrowRightEndOnRectangleIcon,
} from "@heroicons/react/24/outline";
import type { ToggleableModule } from "@arbor/shared";
import { cn } from "@/lib/utils";
import { logout } from "@/app/(authenticated)/actions";

type IconType = React.ComponentType<{ className?: string }>;

type NavItem = { href: string; label: string; icon: IconType };
type NavGroup = { title: string; items: NavItem[] };
type ModuleFlags = Record<ToggleableModule, boolean>;

const HOME: NavItem = { href: "/", label: "Dashboard", icon: HomeIcon };

// Nav groups are computed per-render based on the org's enabled modules.
// Modules off → item hidden. Hospital training has all modules on, so the
// nav looks identical to before this change.
function teamGroup(modules: ModuleFlags): NavGroup {
  const items: NavItem[] = [{ href: "/instructors", label: "Instructors", icon: UserGroupIcon }];
  if (modules["module.classes"]) {
    items.push({ href: "/classes", label: "Classes", icon: AcademicCapIcon });
  }
  items.push({ href: "/skills", label: "Skills", icon: SparklesIcon });
  return { title: "Team", items };
}

function workGroup(modules: ModuleFlags): NavGroup {
  const items: NavItem[] = [
    { href: "/allocations", label: "Allocations", icon: AdjustmentsHorizontalIcon },
    { href: "/tras", label: "TRAs", icon: ClipboardDocumentListIcon },
  ];
  if (modules["module.education_requests"]) {
    items.push({ href: "/request-queue", label: "Request Queue", icon: InboxStackIcon });
  }
  items.push({ href: "/projects", label: "Special Projects", icon: BriefcaseIcon });
  if (modules["module.training_planner"]) {
    items.push({ href: "/training-planner", label: "Training Planner", icon: CalendarDaysIcon });
  }
  return { title: "Work", items };
}

const INSIGHTS_GROUP: NavGroup = {
  title: "Insights",
  items: [{ href: "/reports", label: "Reports", icon: ChartBarIcon }],
};

const ADMIN_GROUP: NavGroup = {
  title: "Admin",
  items: [{ href: "/admin", label: "Organization admin", icon: Cog6ToothIcon }],
};

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  onNavigate?: (() => void) | undefined;
}) {
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={() => {
        onNavigate?.();
      }}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-surface",
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", !active && "text-muted-foreground")} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function NavGroupBlock({
  group,
  pathname,
  onNavigate,
}: {
  group: NavGroup;
  pathname: string;
  onNavigate?: (() => void) | undefined;
}) {
  return (
    <div>
      <p className="text-muted-foreground mb-1 px-3 text-xs font-semibold">{group.title}</p>
      <div className="space-y-0.5">
        {group.items.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
        ))}
      </div>
    </div>
  );
}

function SidebarContent({
  isAdmin,
  modules,
  onNavigate,
}: {
  isAdmin: boolean;
  modules: ModuleFlags;
  onNavigate?: (() => void) | undefined;
}) {
  const pathname = usePathname();
  const team = teamGroup(modules);
  const work = workGroup(modules);
  return (
    <>
      <div className="border-border flex h-16 shrink-0 items-center border-b px-4">
        <Link
          href="/"
          aria-label="Arbor home"
          className="inline-flex items-center transition-transform hover:scale-[1.02]"
          onClick={() => {
            onNavigate?.();
          }}
        >
          <Image
            src="/branding/arbor-mark.png"
            alt="Arbor"
            width={180}
            height={180}
            priority
            className="h-12 w-auto"
          />
        </Link>
      </div>

      <nav
        className="flex flex-1 flex-col gap-5 overflow-y-auto px-2 py-4"
        aria-label="Primary navigation"
      >
        <div className="space-y-0.5">
          <NavLink item={HOME} pathname={pathname} onNavigate={onNavigate} />
        </div>
        <NavGroupBlock group={team} pathname={pathname} onNavigate={onNavigate} />
        <NavGroupBlock group={work} pathname={pathname} onNavigate={onNavigate} />
        <NavGroupBlock group={INSIGHTS_GROUP} pathname={pathname} onNavigate={onNavigate} />
        {isAdmin && (
          <NavGroupBlock group={ADMIN_GROUP} pathname={pathname} onNavigate={onNavigate} />
        )}
      </nav>

      <div className="border-border border-t px-2 py-3">
        <form action={logout}>
          <button
            type="submit"
            className="text-muted-foreground hover:bg-surface hover:text-foreground flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors"
          >
            <ArrowRightEndOnRectangleIcon className="h-4 w-4 shrink-0" />
            <span>Sign out</span>
          </button>
        </form>
      </div>
    </>
  );
}

/** Desktop sidebar — visible on md+, sticky full-height. */
export function DesktopSidebar({ isAdmin, modules }: { isAdmin: boolean; modules: ModuleFlags }) {
  return (
    <aside className="border-border bg-background sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r md:flex">
      <SidebarContent isAdmin={isAdmin} modules={modules} />
    </aside>
  );
}

/** Mobile drawer — hamburger trigger + slide-in panel. */
export function MobileSidebar({ isAdmin, modules }: { isAdmin: boolean; modules: ModuleFlags }) {
  const [open, setOpen] = useState(false);
  const close = () => {
    setOpen(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
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
          <Dialog.Close asChild>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground absolute right-3 top-3 rounded-md p-1"
              aria-label="Close navigation"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </Dialog.Close>
          <SidebarContent isAdmin={isAdmin} modules={modules} onNavigate={close} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
