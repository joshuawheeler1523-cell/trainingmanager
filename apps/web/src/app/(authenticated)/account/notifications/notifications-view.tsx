"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckIcon } from "@heroicons/react/20/solid";
import EmptyState from "@/components/ui/empty-state";
import { markAllNotificationsRead, markNotificationRead } from "@/app/account/actions";

export type NotificationItem = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export default function NotificationsView({ items }: { items: NotificationItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [local, setLocal] = useState(items);

  const unreadCount = local.filter((n) => !n.read_at).length;

  function handleMarkOne(id: string) {
    setLocal((prev) =>
      prev.map((p) => (p.id === id ? { ...p, read_at: new Date().toISOString() } : p)),
    );
    startTransition(async () => {
      const result = await markNotificationRead(id);
      if (!result.ok) {
        toast.error(result.error.message);
        router.refresh();
      }
    });
  }

  function handleMarkAll() {
    setLocal((prev) => prev.map((p) => ({ ...p, read_at: new Date().toISOString() })));
    startTransition(async () => {
      const result = await markAllNotificationsRead();
      if (result.ok) {
        toast.success(`Marked ${result.data.count.toString()} read`);
      } else {
        toast.error(result.error.message);
        router.refresh();
      }
    });
  }

  if (local.length === 0) {
    return <EmptyState title="No notifications yet" description="You're all caught up." />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-xs">
          {local.length.toString()} total · {unreadCount.toString()} unread
        </p>
        {unreadCount > 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={handleMarkAll}
            className="text-muted-foreground hover:text-foreground text-xs disabled:opacity-50"
          >
            Mark all read
          </button>
        )}
      </div>

      <ul className="border-border divide-border divide-y rounded-lg border">
        {local.map((n) => (
          <li key={n.id} className={n.read_at ? "opacity-70" : ""}>
            <div className="flex items-start gap-3 px-3 py-3">
              <div className="min-w-0 flex-1">
                {n.link ? (
                  <Link
                    href={n.link}
                    onClick={() => {
                      if (!n.read_at) handleMarkOne(n.id);
                    }}
                    className="text-foreground hover:text-primary text-sm font-medium"
                  >
                    {n.title}
                  </Link>
                ) : (
                  <p className="text-foreground text-sm font-medium">{n.title}</p>
                )}
                {n.body && <p className="text-muted-foreground mt-0.5 text-xs">{n.body}</p>}
                <p className="text-muted-foreground mt-1 text-[11px] tabular-nums">
                  {new Date(n.created_at).toLocaleString()} · {n.kind}
                </p>
              </div>
              {!n.read_at && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    handleMarkOne(n.id);
                  }}
                  aria-label="Mark read"
                  className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  <CheckIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
