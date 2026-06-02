"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ClipboardDocumentIcon, PlusIcon, TrashIcon, CheckIcon } from "@heroicons/react/20/solid";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import EmptyState from "@/components/ui/empty-state";
import { publicIntakeUrl, type PublicIntakeLink } from "@arbor/shared";
import { createIntakeLink, revokeIntakeLink } from "../../request-queue/actions";

type Props = {
  links: PublicIntakeLink[];
  origin: string;
};

export default function IntakeLinksView({ links, origin }: Props) {
  const [pending, startTransition] = useTransition();
  const [showCreate, setShowCreate] = useState(false);
  const [label, setLabel] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function handleCreate() {
    startTransition(async () => {
      const result = await createIntakeLink({
        label: label || null,
        expires_at: expiresAt || null,
      });
      if (result.ok) {
        toast.success("Link created");
        setLabel("");
        setExpiresAt("");
        setShowCreate(false);
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleRevoke(id: string) {
    startTransition(async () => {
      const result = await revokeIntakeLink(id);
      if (result.ok) toast.success("Link revoked");
      else toast.error(result.error.message);
    });
  }

  async function copy(link: PublicIntakeLink) {
    const url = publicIntakeUrl(origin, link.token);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(link.id);
      setTimeout(() => {
        setCopiedId(null);
      }, 2000);
    } catch {
      toast.error("Couldn't copy — long-press the URL instead.");
    }
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-end">
        {!showCreate && (
          <button
            type="button"
            onClick={() => {
              setShowCreate(true);
            }}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium"
          >
            <PlusIcon className="h-4 w-4" />
            Create link
          </button>
        )}
      </div>

      {showCreate && (
        <div className="border-border bg-background space-y-3 rounded-xl border p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="link-label"
                className="text-muted-foreground mb-1 block text-xs font-medium"
              >
                Label
              </label>
              <input
                id="link-label"
                value={label}
                onChange={(e) => {
                  setLabel(e.target.value);
                }}
                placeholder="All-staff intake form"
                className="border-input bg-background text-foreground w-full rounded-md border px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="link-expires"
                className="text-muted-foreground mb-1 block text-xs font-medium"
              >
                Expires at (optional)
              </label>
              <input
                id="link-expires"
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => {
                  setExpiresAt(e.target.value);
                }}
                className="border-input bg-background text-foreground w-full rounded-md border px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowCreate(false);
                setLabel("");
                setExpiresAt("");
              }}
              className="text-muted-foreground hover:text-foreground text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={handleCreate}
              className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1 text-xs font-medium disabled:opacity-50"
            >
              {pending ? "Creating…" : "Create link"}
            </button>
          </div>
        </div>
      )}

      {links.length === 0 ? (
        <EmptyState
          title="No intake links yet"
          description="Create a tokenized link to collect requests from stakeholders without giving them logins."
        />
      ) : (
        <div className="border-border bg-background overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead className="border-border bg-surface border-b">
              <tr>
                <th className="text-muted-foreground px-4 py-2.5 text-left text-xs font-medium">
                  Label
                </th>
                <th className="text-muted-foreground px-4 py-2.5 text-left text-xs font-medium">
                  URL
                </th>
                <th className="text-muted-foreground px-4 py-2.5 text-left text-xs font-medium">
                  Expires
                </th>
                <th className="text-muted-foreground px-4 py-2.5 text-left text-xs font-medium">
                  Status
                </th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {links.map((l) => {
                const expired = l.expires_at != null && new Date(l.expires_at) < new Date();
                const active = l.is_active && !expired;
                const url = publicIntakeUrl(origin, l.token);
                return (
                  <tr key={l.id} className="hover:bg-surface">
                    <td className="text-foreground px-4 py-3 text-sm">
                      {l.label || <span className="text-muted-foreground italic">No label</span>}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => {
                          void copy(l);
                        }}
                        className="text-foreground hover:text-primary inline-flex items-center gap-1.5 truncate font-mono text-xs"
                        title="Click to copy"
                      >
                        {copiedId === l.id ? (
                          <CheckIcon className="text-success h-3.5 w-3.5" />
                        ) : (
                          <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                        )}
                        <span className="truncate">{url}</span>
                      </button>
                    </td>
                    <td className="text-muted-foreground px-4 py-3 text-xs tabular-nums">
                      {l.expires_at ? new Date(l.expires_at).toLocaleString() : "Never"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          active ? "bg-success-bg text-success" : "bg-surface text-muted-foreground"
                        }`}
                      >
                        {active ? "Active" : expired ? "Expired" : "Revoked"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {active && (
                        <ConfirmDialog
                          trigger={
                            <button
                              type="button"
                              disabled={pending}
                              className="text-destructive hover:text-destructive/80 inline-flex items-center gap-1 text-xs disabled:opacity-50"
                            >
                              <TrashIcon className="h-3.5 w-3.5" />
                              Revoke
                            </button>
                          }
                          title="Revoke this intake link?"
                          description="The URL will stop accepting submissions immediately. Existing requests are unaffected."
                          confirmLabel="Revoke"
                          destructive
                          onConfirm={() => {
                            handleRevoke(l.id);
                          }}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
