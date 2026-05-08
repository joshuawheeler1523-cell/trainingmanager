"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellIcon } from "@heroicons/react/24/outline";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import { markAllNotificationsRead, markNotificationRead } from "@/app/account/actions";

export type NotificationRow = {
  id: string;
  org_id: string;
  recipient_id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

const RECENT_LIMIT = 10;

export default function NotificationBell({
  initial,
  userId,
}: {
  initial: NotificationRow[];
  userId: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState<NotificationRow[]>(initial);

  // Realtime subscription: listen for INSERTs to public.notifications scoped
  // to the current user. Supabase's postgres_changes channel pushes the full
  // row, so we just prepend it. UPDATE (read_at toggling) we re-fetch on
  // navigation rather than replaying the row diff.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as NotificationRow;
          setItems((prev) => {
            // Dedupe in case the page also re-fetched.
            if (prev.some((p) => p.id === row.id)) return prev;
            return [row, ...prev].slice(0, RECENT_LIMIT);
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  const unreadCount = items.filter((n) => !n.read_at).length;

  async function handleClickItem(n: NotificationRow) {
    // Optimistically mark read so the badge clears.
    setItems((prev) =>
      prev.map((p) => (p.id === n.id ? { ...p, read_at: new Date().toISOString() } : p)),
    );
    await markNotificationRead(n.id);
    router.refresh();
  }

  async function handleMarkAll() {
    setItems((prev) => prev.map((p) => ({ ...p, read_at: new Date().toISOString() })));
    await markAllNotificationsRead();
    router.refresh();
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Notifications"
          className="text-muted-foreground hover:bg-surface hover:text-foreground relative flex items-center rounded-md p-1.5"
        >
          <BellIcon className="h-5 w-5" />
          {unreadCount > 0 && (
            <span
              className="bg-destructive text-destructive-foreground absolute -right-0.5 -top-0.5 rounded-full px-1 text-[10px] font-semibold leading-tight"
              aria-label={`${unreadCount.toString()} unread`}
            >
              {unreadCount > 9 ? "9+" : unreadCount.toString()}
            </span>
          )}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="border-border bg-background z-50 w-80 rounded-lg border shadow-xl"
        >
          <div className="border-border flex items-center justify-between border-b px-3 py-2">
            <p className="text-foreground text-sm font-semibold">Notifications</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  void handleMarkAll();
                }}
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                Mark all read
              </button>
            )}
          </div>
          <ul className="divide-border max-h-96 divide-y overflow-y-auto">
            {items.length === 0 ? (
              <li className="text-muted-foreground px-3 py-6 text-center text-xs">
                No notifications yet.
              </li>
            ) : (
              items.map((n) => {
                const Inner = (
                  <div className={n.read_at ? "opacity-70" : ""}>
                    <p className="text-foreground text-sm font-medium">{n.title}</p>
                    {n.body && (
                      <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">{n.body}</p>
                    )}
                    <p className="text-muted-foreground mt-1 text-[11px] tabular-nums">
                      {new Date(n.created_at).toLocaleString()}
                    </p>
                  </div>
                );
                return (
                  <li key={n.id}>
                    {n.link ? (
                      <Link
                        href={n.link}
                        onClick={() => {
                          void handleClickItem(n);
                        }}
                        className="hover:bg-surface block px-3 py-2"
                      >
                        {Inner}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          void handleClickItem(n);
                        }}
                        className="hover:bg-surface block w-full px-3 py-2 text-left"
                      >
                        {Inner}
                      </button>
                    )}
                  </li>
                );
              })
            )}
          </ul>
          <div className="border-border border-t px-3 py-2 text-right">
            <Link href="/account/notifications" className="text-primary text-xs hover:underline">
              View all →
            </Link>
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
