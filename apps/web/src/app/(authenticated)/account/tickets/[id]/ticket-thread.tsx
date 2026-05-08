"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  TICKET_STATUS_VALUES,
  markTicketReadForViewer,
  replyToTicket,
  setTicketStatus,
} from "@/app/account/actions";

export type TicketDetail = {
  id: string;
  subject: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  created_at: string;
};

export type TicketMessage = {
  id: string;
  ticket_id: string;
  author_kind: string;
  author_id: string | null;
  body: string;
  created_at: string;
};

const STATUS_BADGE: Record<string, string> = {
  open: "bg-primary/10 text-primary",
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
  resolved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
  closed: "bg-surface text-muted-foreground",
};

export default function TicketThread({
  ticket,
  messages,
  viewerSide,
}: {
  ticket: TicketDetail;
  messages: TicketMessage[];
  viewerSide: "user" | "admin";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reply, setReply] = useState("");

  // Clear the unread flag for this viewer when the page mounts.
  useEffect(() => {
    void markTicketReadForViewer(ticket.id, viewerSide);
  }, [ticket.id, viewerSide]);

  function handleReply() {
    const body = reply.trim();
    if (!body) return;
    startTransition(async () => {
      const result = await replyToTicket(ticket.id, { body, authorKind: viewerSide });
      if (result.ok) {
        setReply("");
        toast.success("Reply sent");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleStatus(next: string) {
    startTransition(async () => {
      const result = await setTicketStatus(ticket.id, { status: next });
      if (result.ok) {
        toast.success(`Status: ${next}`);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  // First entry: the original ticket description from the requester.
  const allEntries: TicketMessage[] = [
    {
      id: `${ticket.id}-original`,
      ticket_id: ticket.id,
      author_kind: "user",
      author_id: null,
      body: ticket.description,
      created_at: ticket.created_at,
    },
    ...messages,
  ];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_240px]">
      {/* Thread */}
      <div className="space-y-4">
        <ul className="space-y-3">
          {allEntries.map((m) => {
            const isUser = m.author_kind === "user";
            return (
              <li key={m.id} className={isUser ? "" : "ml-6"}>
                <div
                  className={`border-border rounded-lg border p-3 ${
                    isUser ? "bg-background" : "bg-primary/5 border-primary/30 dark:bg-primary/10"
                  }`}
                >
                  <div className="text-muted-foreground mb-1 flex items-center gap-2 text-xs">
                    <span className="font-medium capitalize">
                      {isUser ? "Requester" : "Support"}
                    </span>
                    <span>· {new Date(m.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-foreground whitespace-pre-wrap text-sm">{m.body}</p>
                </div>
              </li>
            );
          })}
        </ul>

        {/* Reply composer */}
        {ticket.status === "closed" ? (
          <p className="text-muted-foreground text-xs">
            This ticket is closed. Reopen via the status changer to add another reply.
          </p>
        ) : (
          <div className="border-border bg-background space-y-2 rounded-lg border p-3">
            <textarea
              rows={4}
              value={reply}
              onChange={(e) => {
                setReply(e.target.value);
              }}
              placeholder="Write a reply…"
              className="border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm"
            />
            <div className="flex justify-end">
              <button
                type="button"
                disabled={pending || !reply.trim()}
                onClick={handleReply}
                className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              >
                {pending ? "Sending…" : "Send reply"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Side panel: status, priority, category */}
      <aside className="space-y-3">
        <div className="border-border bg-background rounded-lg border p-3">
          <p className="text-muted-foreground text-xs font-medium uppercase">Status</p>
          <p className="mt-1">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[ticket.status] ?? "bg-surface"}`}
            >
              {ticket.status}
            </span>
          </p>
          <div className="mt-2 grid grid-cols-2 gap-1">
            {TICKET_STATUS_VALUES.map((s) => (
              <button
                key={s}
                type="button"
                disabled={pending || s === ticket.status}
                onClick={() => {
                  handleStatus(s);
                }}
                className={`text-foreground hover:bg-surface border-input rounded-md border px-2 py-1 text-xs capitalize disabled:opacity-50 ${s === ticket.status ? "bg-surface" : ""}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="border-border bg-background space-y-1 rounded-lg border p-3 text-xs">
          <p>
            <span className="text-muted-foreground">Category: </span>
            <span className="text-foreground capitalize">{ticket.category.replace(/_/g, " ")}</span>
          </p>
          <p>
            <span className="text-muted-foreground">Priority: </span>
            <span className="text-foreground capitalize">{ticket.priority}</span>
          </p>
          <p>
            <span className="text-muted-foreground">Opened: </span>
            <span className="text-foreground">
              {new Date(ticket.created_at).toLocaleDateString()}
            </span>
          </p>
        </div>
      </aside>
    </div>
  );
}
