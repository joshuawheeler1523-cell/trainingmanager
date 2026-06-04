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
  ArrowTrendingUpIcon,
  ChatBubbleLeftRightIcon,
  Cog6ToothIcon,
  WrenchScrewdriverIcon,
  Bars3Icon,
  XMarkIcon,
  StarIcon,
} from "@heroicons/react/24/outline";
import type { ToggleableModule } from "@arbor/shared";
import { cn } from "@/lib/utils";
import { Label } from "@/components/labels";
import { Eyebrow } from "@/components/ui";

type IconType = React.ComponentType<{ className?: string }>;

// SidebarCounts: live numerals shown next to specific nav items so the
// menu reads as information density, not just navigation. Each is a count
// of "things on the user's plate" — RLS scopes it per-role automatically.
export type SidebarCounts = {
  workIntake?: number;
  requestQueue?: number;
  oneOnOnes?: number;
};

type NavItem = {
  href: string;
  label: React.ReactNode;
  icon: IconType;
  countKey?: keyof SidebarCounts;
};
type NavGroup = { title: string; items: NavItem[] };
type ModuleFlags = Record<ToggleableModule, boolean>;

const HOME: NavItem = { href: "/", label: "Dashboard", icon: HomeIcon };

function teamGroup(modules: ModuleFlags): NavGroup {
  const items: NavItem[] = [
    { href: "/instructors", label: <Label kind="entity.instructor" plural />, icon: UserGroupIcon },
  ];
  if (modules["module.classes"]) {
    items.push({ href: "/classes", label: "Classes", icon: AcademicCapIcon });
  }
  items.push({ href: "/skills", label: "Skills", icon: SparklesIcon });
  items.push({ href: "/super-users", label: "Super Users", icon: StarIcon });
  return { title: "Team", items };
}

function workGroup(modules: ModuleFlags, isAdmin: boolean): NavGroup {
  const items: NavItem[] = [
    { href: "/allocations", label: "Allocations", icon: AdjustmentsHorizontalIcon },
    {
      href: "/tras",
      label: "Work Intake",
      icon: ClipboardDocumentListIcon,
      countKey: "workIntake",
    },
  ];
  if (modules["module.education_requests"]) {
    items.push({
      href: "/request-queue",
      label: "Request Queue",
      icon: InboxStackIcon,
      countKey: "requestQueue",
    });
  }
  items.push({ href: "/projects", label: "Special Projects", icon: BriefcaseIcon });
  if (modules["module.training_planner"]) {
    items.push({ href: "/training-planner", label: "Training Planner", icon: CalendarDaysIcon });
  }
  // 1:1s is manager-only; the page renders a "managers only" placeholder
  // for everyone else, so hide the link to avoid a dangling dead nav item.
  if (isAdmin) {
    items.push({
      href: "/one-on-ones",
      label: "1:1s",
      icon: ChatBubbleLeftRightIcon,
      countKey: "oneOnOnes",
    });
  }
  return { title: "Work", items };
}

function insightsGroup(isAdmin: boolean): NavGroup {
  const items: NavItem[] = [{ href: "/reports", label: "Reports", icon: ChartBarIcon }];
  // Forecast + Instructor Quality are org/department-wide manager views.
  if (isAdmin) {
    items.push({ href: "/forecast", label: "Forecast", icon: ArrowTrendingUpIcon });
    items.push({ href: "/instructor-quality", label: "Instructor Quality", icon: StarIcon });
  }
  return { title: "Insights", items };
}

const TOOLS_GROUP: NavGroup = {
  title: "Tools",
  items: [{ href: "/sketchpad", label: "Schedule Sketchpad", icon: WrenchScrewdriverIcon }],
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
  count,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  count: number | undefined;
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
        // Editorial active state: left-edge sage rail + bolder type, no
        // background pill. Inactive items hover to surface for affordance.
        "group relative flex items-center gap-2.5 py-1.5 pl-4 pr-3 text-sm transition-colors",
        active
          ? "text-foreground font-display border-l-2 border-[var(--primary)] font-medium"
          : "text-muted-foreground hover:text-foreground border-l-2 border-transparent font-normal",
      )}
    >
      <Icon
        className={cn(
          "h-3.5 w-3.5 shrink-0",
          active ? "text-[var(--primary)]" : "text-muted-foreground/70",
        )}
      />
      <span className="truncate">{item.label}</span>
      {typeof count === "number" && count > 0 && (
        <span
          className={cn(
            "ml-auto font-mono text-[10.5px] tabular-nums",
            active ? "text-[var(--primary)]" : "text-muted-foreground",
          )}
          aria-label={`${count.toString()} on your plate`}
        >
          {count}
        </span>
      )}
    </Link>
  );
}

function NavGroupBlock({
  group,
  number,
  pathname,
  counts,
  onNavigate,
}: {
  group: NavGroup;
  number: string;
  pathname: string;
  counts: SidebarCounts;
  onNavigate?: (() => void) | undefined;
}) {
  return (
    <div>
      <div className="border-border/60 mb-1 flex items-baseline gap-2 border-b border-dashed pb-1.5 pl-4 pr-3">
        <Eyebrow className="text-muted-foreground">
          <span className="tabular-nums opacity-60">{number}</span>
          <span aria-hidden="true" className="mx-1.5 opacity-40">
            —
          </span>
          {group.title}
        </Eyebrow>
      </div>
      <div className="space-y-px">
        {group.items.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            pathname={pathname}
            count={item.countKey ? counts[item.countKey] : undefined}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </div>
  );
}

function SidebarContent({
  isAdmin,
  modules,
  counts,
  onNavigate,
}: {
  isAdmin: boolean;
  modules: ModuleFlags;
  counts: SidebarCounts;
  onNavigate?: (() => void) | undefined;
}) {
  const pathname = usePathname();
  const team = teamGroup(modules);
  const work = workGroup(modules, isAdmin);
  // Section numbering is computed left-to-right so hidden Admin doesn't
  // skip a number for non-admin users.
  const numberedGroups: { group: NavGroup; number: string }[] = [
    { group: team, number: "01" },
    { group: work, number: "02" },
    { group: insightsGroup(isAdmin), number: "03" },
    { group: TOOLS_GROUP, number: "04" },
  ];
  if (isAdmin) numberedGroups.push({ group: ADMIN_GROUP, number: "05" });

  return (
    <>
      <div className="border-border flex h-24 shrink-0 items-center border-b px-3">
        <Link
          href="/dashboard"
          aria-label="Arbor home"
          className="inline-flex items-center transition-transform hover:scale-[1.02]"
          onClick={() => {
            onNavigate?.();
          }}
        >
          <Image
            src="/branding/arbor-logo-full.png"
            alt="Arbor — Training Resource Management"
            width={1024}
            height={399}
            priority
            className="h-[72px] w-auto"
          />
        </Link>
      </div>

      <nav
        className="flex flex-1 flex-col gap-5 overflow-y-auto py-5"
        aria-label="Primary navigation"
      >
        <div>
          <NavLink item={HOME} pathname={pathname} count={undefined} onNavigate={onNavigate} />
        </div>
        {numberedGroups.map(({ group, number }) => (
          <NavGroupBlock
            key={group.title}
            group={group}
            number={number}
            pathname={pathname}
            counts={counts}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      <div className="border-border/60 text-muted-foreground/80 border-t px-4 py-3 font-mono text-[10px] uppercase tracking-[0.08em]">
        <span aria-hidden="true">⌘K</span>
        <span className="ml-2">to search</span>
      </div>
    </>
  );
}

/** Desktop sidebar — visible on md+, sticky full-height. */
export function DesktopSidebar({
  isAdmin,
  modules,
  counts,
}: {
  isAdmin: boolean;
  modules: ModuleFlags;
  counts: SidebarCounts;
}) {
  return (
    <aside className="border-border bg-background sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r md:flex">
      <SidebarContent isAdmin={isAdmin} modules={modules} counts={counts} />
    </aside>
  );
}

/** Mobile drawer — hamburger trigger + slide-in panel. */
export function MobileSidebar({
  isAdmin,
  modules,
  counts,
}: {
  isAdmin: boolean;
  modules: ModuleFlags;
  counts: SidebarCounts;
}) {
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
          <SidebarContent isAdmin={isAdmin} modules={modules} counts={counts} onNavigate={close} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
