"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import Link from "next/link";
import { useEffect, useState } from "react";
import { UserCircleIcon, SwatchIcon } from "@heroicons/react/24/outline";
import { logout } from "@/app/(authenticated)/actions";
import { setThemeAction } from "@/app/(authenticated)/account/profile-actions";
import { useCurrentRole, Label } from "@/components/labels";
import { THEME_LABELS, type Theme } from "@/lib/theme";

type Props = {
  email: string;
  name: string;
  isAdmin: boolean;
};

export default function ProfileMenu({ email, name, isAdmin }: Props) {
  const role = useCurrentRole();
  const [theme, setThemeState] = useState<Theme>("editorial");
  useEffect(() => {
    setThemeState(
      document.documentElement.getAttribute("data-theme") === "bright" ? "bright" : "editorial",
    );
  }, []);
  const nextTheme: Theme = theme === "bright" ? "editorial" : "bright";

  function toggleTheme() {
    const root = document.documentElement;
    if (nextTheme === "editorial") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", nextTheme);
    setThemeState(nextTheme);
    void setThemeAction(nextTheme);
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="text-muted-foreground hover:bg-surface hover:text-foreground focus-visible:ring-ring flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2"
          aria-label="Profile menu"
        >
          <UserCircleIcon className="h-5 w-5" />
          <span className="hidden max-w-[140px] truncate md:block">{name}</span>
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="border-border bg-background animate-in fade-in-0 zoom-in-95 z-50 min-w-[220px] rounded-lg border p-1 shadow-lg"
        >
          <div className="border-border mb-1 border-b px-3 py-2">
            <p className="text-foreground text-sm font-medium">{name}</p>
            <p className="text-muted-foreground mt-0.5 truncate text-xs">{email}</p>
            {role && (
              <p className="text-muted-foreground mt-1.5 inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide">
                <span
                  className="bg-primary/10 text-primary rounded px-1.5 py-0.5"
                  aria-label={`Role: ${role}`}
                >
                  <Label kind={`role.${role}`} />
                </span>
              </p>
            )}
          </div>

          <DropdownMenu.Item asChild>
            <Link
              href="/account"
              className="text-foreground hover:bg-surface focus:bg-surface flex cursor-pointer items-center rounded-md px-3 py-1.5 text-sm outline-none"
            >
              Account &amp; appearance
            </Link>
          </DropdownMenu.Item>

          <DropdownMenu.Item asChild>
            <Link
              href="/account/tickets"
              className="text-foreground hover:bg-surface focus:bg-surface flex cursor-pointer items-center rounded-md px-3 py-1.5 text-sm outline-none"
            >
              My Tickets
            </Link>
          </DropdownMenu.Item>

          <DropdownMenu.Item asChild>
            <Link
              href="/account/notifications"
              className="text-foreground hover:bg-surface focus:bg-surface flex cursor-pointer items-center rounded-md px-3 py-1.5 text-sm outline-none"
            >
              Notifications
            </Link>
          </DropdownMenu.Item>

          {isAdmin && (
            <>
              <DropdownMenu.Separator className="bg-border my-1 h-px" />
              <DropdownMenu.Item asChild>
                <Link
                  href="/admin"
                  className="text-foreground hover:bg-surface focus:bg-surface flex cursor-pointer items-center rounded-md px-3 py-1.5 text-sm outline-none"
                >
                  Organization admin
                </Link>
              </DropdownMenu.Item>
            </>
          )}

          <DropdownMenu.Item asChild>
            <Link
              href="/account/set-password"
              className="text-foreground hover:bg-surface focus:bg-surface flex cursor-pointer items-center rounded-md px-3 py-1.5 text-sm outline-none"
            >
              Set Password
            </Link>
          </DropdownMenu.Item>

          <DropdownMenu.Separator className="bg-border my-1 h-px" />

          <DropdownMenu.Item
            onSelect={(e) => {
              // Keep the menu open so the label flips and they can toggle back.
              e.preventDefault();
              toggleTheme();
            }}
            className="text-foreground hover:bg-surface focus:bg-surface flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-sm outline-none"
          >
            <SwatchIcon className="h-4 w-4" />
            Switch to {THEME_LABELS[nextTheme]} theme
          </DropdownMenu.Item>

          <DropdownMenu.Separator className="bg-border my-1 h-px" />

          <DropdownMenu.Item
            asChild
            onSelect={(e) => {
              // Keep the menu mounted so the form has time to submit the
              // server action. Without this, Radix closes the menu on
              // click, unmounting the form before the POST fires.
              e.preventDefault();
            }}
          >
            <form action={logout} className="w-full">
              <button
                type="submit"
                className="text-destructive hover:bg-surface focus:bg-surface flex w-full cursor-pointer items-center rounded-md px-3 py-1.5 text-sm outline-none"
              >
                Sign Out
              </button>
            </form>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
