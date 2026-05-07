"use client";

import { useState } from "react";
import Link from "next/link";
import { useHotkeys } from "react-hotkeys-hook";
import { QuestionMarkCircleIcon } from "@heroicons/react/24/outline";
import PrimaryNav from "./primary-nav";
import SubBar from "./sub-bar";
import ProfileMenu from "./profile-menu";
import MobileNav from "./mobile-nav";
import CommandPalette from "./command-palette";
import HelpDrawer from "./help-drawer";

type Props = {
  children: React.ReactNode;
  orgSwitcherSlot: React.ReactNode;
  userEmail: string;
  userName: string;
};

export default function AppShell({ children, orgSwitcherSlot, userEmail, userName }: Props) {
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
    <div className="flex min-h-screen flex-col">
      {/* Top bar */}
      <header className="border-border bg-background sticky top-0 z-30 flex h-12 items-center gap-3 border-b px-4">
        {/* Left: logo + org switcher */}
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="text-foreground hover:text-primary text-sm font-bold"
            aria-label="Arbor home"
          >
            Arbor
          </Link>
          <span className="text-border">·</span>
          {orgSwitcherSlot}
        </div>

        {/* Center: primary nav (desktop) */}
        <div className="flex flex-1 justify-center">
          <PrimaryNav />
        </div>

        {/* Right: help + profile + mobile trigger */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setHelpOpen(true);
            }}
            className="text-muted-foreground hover:bg-surface hover:text-foreground flex items-center rounded-md p-1.5"
            aria-label="Help"
            title="Help (?)"
          >
            <QuestionMarkCircleIcon className="h-5 w-5" />
          </button>

          <ProfileMenu email={userEmail} name={userName} />
          <MobileNav />
        </div>
      </header>

      {/* Sub-bar (secondary nav) */}
      <SubBar />

      {/* Page content */}
      <main className="bg-surface flex-1">{children}</main>

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
