"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import * as Dialog from "@radix-ui/react-dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PlusIcon } from "@heroicons/react/20/solid";
import EmptyState from "@/components/ui/empty-state";
import {
  TICKET_CATEGORY_VALUES,
  TICKET_PRIORITY_VALUES,
  createTicket,
} from "@/app/account/actions";

export type TicketRow = {
  id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  last_message_at: string;
  last_message_by: string;
  unread_for_user: boolean;
  unread_for_admin: boolean;
  created_at: string;
};

const STATUS_BADGE: Record<string, string> = {
  open: "bg-primary/10 text-primary",
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
  resolved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
  closed: "bg-surface text-muted-foreground",
};

const PRIORITY_BADGE: Record<string, string> = {
  low: "bg-surface text-muted-foreground",
  medium: "bg-primary/10 text-primary",
  high: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
  urgent: "bg-destructive/10 text-destructive",
};

const CATEGORY_LABEL: Record<string, string> = {
  bug: "Bug",
  how_to: "How-to",
  feature_request: "Feature request",
  account_billing: "Account / billing",
};

export default function TicketsView({
  tickets,
  viewerSide,
}: {
  tickets: TicketRow[];
  viewerSide: "user" | "admin";
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            setOpen(true);
          }}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium"
        >
          <PlusIcon className="h-4 w-4" />
          New ticket
        </button>
      </div>

      {tickets.length === 0 ? (
        <EmptyState
          title="No tickets yet"
          description="Open a ticket above when you need a hand or want to report a bug."
        />
      ) : (
        <div className="border-border overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-surface text-muted-foreground text-xs">
              <tr>
                <Th className="w-1/3">Subject</Th>
                <Th>Category</Th>
                <Th>Priority</Th>
                <Th>Status</Th>
                <Th>Last update</Th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {tickets.map((t) => {
                const unread = viewerSide === "admin" ? t.unread_for_admin : t.unread_for_user;
                return (
                  <tr key={t.id} className="hover:bg-surface/50">
                    <td className="px-3 py-2">
                      <Link
                        href={`/account/tickets/${t.id}`}
                        className="text-primary font-medium hover:underline"
                      >
                        {t.subject}
                      </Link>
                      {unread && (
                        <span className="bg-destructive ml-2 inline-block h-2 w-2 rounded-full align-middle" />
                      )}
                    </td>
                    <td className="text-muted-foreground px-3 py-2 text-xs">
                      {CATEGORY_LABEL[t.category] ?? t.category}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${PRIORITY_BADGE[t.priority] ?? "bg-surface"}`}
                      >
                        {t.priority}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[t.status] ?? "bg-surface"}`}
                      >
                        {t.status}
                      </span>
                    </td>
                    <td className="text-muted-foreground px-3 py-2 text-xs tabular-nums">
                      {new Date(t.last_message_at).toLocaleString()}
                      <span className="ml-1 capitalize">· {t.last_message_by}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <NewTicketDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-3 py-2 text-left text-xs font-medium uppercase tracking-wide ${className ?? ""}`}
    >
      {children}
    </th>
  );
}

// ── new ticket dialog ─────────────────────────────────────────────────────

const newTicketSchema = z.object({
  subject: z.string().min(1, "Subject is required").max(200),
  description: z.string().min(1, "Description is required").max(10_000),
  category: z.enum(TICKET_CATEGORY_VALUES).default("how_to"),
  priority: z.enum(TICKET_PRIORITY_VALUES).default("medium"),
});
type NewTicketValues = z.infer<typeof newTicketSchema>;

function NewTicketDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<NewTicketValues>({
    resolver: zodResolver(newTicketSchema),
    defaultValues: { subject: "", description: "", category: "how_to", priority: "medium" },
  });

  function onSubmit(values: NewTicketValues) {
    startTransition(async () => {
      const result = await createTicket(values);
      if (result.ok) {
        toast.success("Ticket created");
        reset();
        onOpenChange(false);
        router.push(`/account/tickets/${result.data.id}`);
      } else {
        toast.error(result.error.message);
      }
    });
  }

  const fieldClass =
    "border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="data-[state=open]:animate-in data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="border-border bg-background data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border p-6 shadow-xl">
          <Dialog.Title className="text-foreground text-base font-semibold">
            New support ticket
          </Dialog.Title>
          <Dialog.Description className="text-muted-foreground mt-1 text-xs">
            Tell us what you were trying to do, what happened, and what you expected. Screenshots
            land in the next phase.
          </Dialog.Description>

          <form
            onSubmit={(e) => {
              void handleSubmit(onSubmit)(e);
            }}
            className="mt-4 space-y-3"
          >
            <div>
              <label htmlFor="subject" className="text-foreground mb-1 block text-xs font-medium">
                Subject *
              </label>
              <input id="subject" {...register("subject")} className={fieldClass} />
              {errors.subject && (
                <p className="text-destructive mt-1 text-xs">{errors.subject.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="category"
                  className="text-foreground mb-1 block text-xs font-medium"
                >
                  Category
                </label>
                <select id="category" {...register("category")} className={fieldClass}>
                  {TICKET_CATEGORY_VALUES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABEL[c]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="priority"
                  className="text-foreground mb-1 block text-xs font-medium"
                >
                  Priority
                </label>
                <select id="priority" {...register("priority")} className={fieldClass}>
                  {TICKET_PRIORITY_VALUES.map((p) => (
                    <option key={p} value={p} className="capitalize">
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor="description"
                className="text-foreground mb-1 block text-xs font-medium"
              >
                Description *
              </label>
              <textarea
                id="description"
                rows={6}
                {...register("description")}
                className={fieldClass}
              />
              {errors.description && (
                <p className="text-destructive mt-1 text-xs">{errors.description.message}</p>
              )}
            </div>

            <div className="border-border flex items-center justify-end gap-2 border-t pt-4">
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false);
                }}
                className="text-muted-foreground hover:text-foreground rounded-md px-3 py-1.5 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending}
                className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              >
                {pending ? "Submitting…" : "Submit"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
