"use client";

import { useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { QuestionMarkCircleIcon } from "@heroicons/react/24/outline";
import type { ToggleableModule } from "@arbor/shared";
import ProfileMenu from "./profile-menu";
import CommandPalette from "./command-palette";
import HelpDrawer from "./help-drawer";
import NotificationBell, { type NotificationRow } from "./notification-bell";
import { DesktopSidebar, MobileSidebar } from "./sidebar";

type Props = {
  children: React.ReactNode;
  orgSwitcherSlot: React.ReactNode;
  userEmail: string;
  userName: string;
  userId: string;
  isAdmin: boolean;
  modules: Record<ToggleableModule, boolean>;
  initialNotifications: NotificationRow[];
};

export default function AppShell({
  children,
  orgSwitcherSlot,
  userEmail,
  userName,
  userId,
  isAdmin,
  modules,
  initialNotifications,
}: Props) {
  const [commandOpen, setCommandOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useHotkeys("mod+k", (e) => {
    e.preventDefault();
    setCommandOpen(true);
  });

  useHotkeys("mod+s", (e) => {
    e.preventDefault();
    // no-op: save is handled by each form; shortcut is a convenience hint
  });

  useHotkeys("?", () => {
    setHelpOpen(true);
  });

  return (
    <div className="bg-canvas flex min-h-screen">
      {/* Skip to content — visible only when focused via keyboard. */}
      <a
        href="#main-content"
        className="bg-primary text-primary-foreground focus:ring-ring sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:px-3 focus:py-1.5 focus:text-sm focus:font-medium focus:shadow-md focus:ring-2"
      >
        Skip to main content
      </a>

      <DesktopSidebar isAdmin={isAdmin} modules={modules} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="border-border bg-background sticky top-0 z-30 flex h-14 items-center gap-3 border-b px-4">
          <MobileSidebar isAdmin={isAdmin} modules={modules} />
          <div className="min-w-0 flex-1">{orgSwitcherSlot}</div>
          <div className="flex items-center gap-1">
            <NotificationBell initial={initialNotifications} userId={userId} />
            <button
              type="button"
              onClick={() => {
                setHelpOpen(true);
              }}
              className="text-muted-foreground hover:bg-surface hover:text-foreground flex items-center rounded-md p-1.5"
              aria-label="Help"
              title="Help (?)"
            >
              <QuestionMarkCircleIcon className="h-5 w-5" />
            </button>
            <ProfileMenu email={userEmail} name={userName} isAdmin={isAdmin} />
          </div>
        </header>

        {/* Page content */}
        <main id="main-content" tabIndex={-1} className="bg-canvas flex-1">
          {children}
        </main>
      </div>

      {/* Global overlays */}
      <CommandPalette
        open={commandOpen}
        onClose={() => {
          setCommandOpen(false);
        }}
      />
      <HelpDrawer
        open={helpOpen}
        onClose={() => {
          setHelpOpen(false);
        }}
      />
    </div>
  );
}
