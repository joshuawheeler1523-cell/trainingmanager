"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowPathIcon,
  CheckIcon,
  ClipboardDocumentIcon,
  PaperAirplaneIcon,
  TrashIcon,
} from "@heroicons/react/20/solid";
import { resendInvitation, revokeInvitation } from "../actions";

export type InvitationRow = {
  id: string;
  email: string;
  role: "manager" | "instructor" | "viewer";
  visibility: "full" | "limited";
  token: string;
  accept_url: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
};

export default function InvitationsView({ invitations }: { invitations: InvitationRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const pendingInvites = invitations.filter((i) => !i.accepted_at);
  const accepted = invitations.filter((i) => i.accepted_at);

  function handleResend(id: string) {
    startTransition(async () => {
      const result = await resendInvitation(id);
      if (result.ok) {
        if (result.data.emailDelivered) {
          toast.success("Resent — expiry extended by 7 days");
        } else {
          toast.success("Expiry extended (email delivery is unconfigured)");
        }
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleRevoke(id: string) {
    if (!confirm("Revoke this invitation? The link will stop working.")) return;
    startTransition(async () => {
      const result = await revokeInvitation(id);
      if (result.ok) {
        toast.success("Invitation revoked");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  async function handleCopy(id: string, url: string) {
    await navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId(null);
    }, 2000);
  }

  return (
    <div className="space-y-6">
      <div className="border-border bg-surface/40 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
        <p className="text-muted-foreground text-xs">
          Send new invites and manage roles from the Team page.
        </p>
        <Link
          href="/admin/team"
          className="bg-primary text-primary-foreground inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium hover:opacity-90"
        >
          <PaperAirplaneIcon className="h-4 w-4" />
          New invite
        </Link>
      </div>
      <Section title={`Pending (${pendingInvites.length.toString()})`}>
        {pendingInvites.length === 0 ? (
          <Empty message="No pending invitations." />
        ) : (
          <Table>
            <thead className="bg-surface text-muted-foreground text-xs">
              <tr>
                <Th>Email</Th>
                <Th>Role</Th>
                <Th>Visibility</Th>
                <Th>Sent</Th>
                <Th>Expires</Th>
                <Th>Link</Th>
                <Th className="w-24" />
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {pendingInvites.map((i) => {
                const isExpired = new Date(i.expires_at) < new Date();
                return (
                  <tr key={i.id}>
                    <td className="text-foreground px-3 py-2">{i.email}</td>
                    <td className="text-muted-foreground px-3 py-2 text-xs capitalize">{i.role}</td>
                    <td className="text-muted-foreground px-3 py-2 text-xs capitalize">
                      {i.visibility}
                    </td>
                    <td className="text-muted-foreground px-3 py-2 text-xs tabular-nums">
                      {new Date(i.created_at).toLocaleDateString()}
                    </td>
                    <td
                      className={`px-3 py-2 text-xs tabular-nums ${isExpired ? "text-destructive font-medium" : "text-muted-foreground"}`}
                    >
                      {new Date(i.expires_at).toLocaleDateString()}
                      {isExpired ? " (expired)" : ""}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => {
                          void handleCopy(i.id, i.accept_url);
                        }}
                        aria-label="Copy invite link"
                        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
                      >
                        {copiedId === i.id ? (
                          <CheckIcon className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                        )}
                        {copiedId === i.id ? "Copied" : "Copy"}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            handleResend(i.id);
                          }}
                          aria-label="Resend invitation"
                          className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                        >
                          <ArrowPathIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            handleRevoke(i.id);
                          }}
                          aria-label="Revoke invitation"
                          className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Section>

      {accepted.length > 0 && (
        <Section title={`Accepted (${accepted.length.toString()})`}>
          <Table>
            <thead className="bg-surface text-muted-foreground text-xs">
              <tr>
                <Th>Email</Th>
                <Th>Role</Th>
                <Th>Accepted</Th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {accepted.map((i) => (
                <tr key={i.id}>
                  <td className="text-foreground px-3 py-2">{i.email}</td>
                  <td className="text-muted-foreground px-3 py-2 text-xs capitalize">
                    {i.role.replace("org_admin", "admin")}
                  </td>
                  <td className="text-muted-foreground px-3 py-2 text-xs tabular-nums">
                    {i.accepted_at ? new Date(i.accepted_at).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-foreground mb-2 text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-border overflow-hidden rounded-lg border">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

function Empty({ message }: { message: string }) {
  return (
    <div className="border-border bg-surface rounded-lg border border-dashed p-8 text-center">
      <p className="text-muted-foreground text-sm">{message}</p>
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
