"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  deleteUserAction,
  forceSignOutUserAction,
  sendMagicLinkForUserAction,
  sendPasswordResetForUserAction,
  suspendUserAction,
  unsuspendUserAction,
} from "../actions";

export default function UserActions({
  userId,
  userEmail,
  isSuspended,
}: {
  userId: string;
  userEmail: string;
  isSuspended: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const wrap =
    (label: string, fn: () => Promise<{ ok: boolean }>, refreshAfter = false) =>
    () => {
      startTransition(async () => {
        const result = await fn();
        if (result.ok) {
          toast.success(label);
          if (refreshAfter) router.refresh();
        } else {
          toast.error(
            "error" in result ? (result as { error: { message: string } }).error.message : "Failed",
          );
        }
      });
    };

  const handleResetPassword = wrap("Reset email sent", async () =>
    sendPasswordResetForUserAction({ userId }),
  );

  const handleMagicLink = () => {
    startTransition(async () => {
      const result = await sendMagicLinkForUserAction({ userId });
      if (result.ok) {
        toast.success(
          result.data.emailSent
            ? `Magic link sent to ${userEmail}`
            : `Link generated but email failed (Resend not configured)`,
        );
      } else {
        toast.error(result.error.message);
      }
    });
  };

  const handleForceSignOut = () => {
    if (!confirm(`Force-sign-out ${userEmail} from every device?`)) return;
    wrap("Signed out everywhere", async () => forceSignOutUserAction({ userId }))();
  };

  const handleSuspend = () => {
    if (!confirm(`Suspend ${userEmail}? They won't be able to sign in until unsuspended.`)) return;
    wrap("User suspended", async () => suspendUserAction({ userId }), true)();
  };

  const handleUnsuspend = () => {
    if (!confirm(`Restore sign-in access for ${userEmail}?`)) return;
    wrap("User restored", async () => unsuspendUserAction({ userId }), true)();
  };

  const handleDelete = () => {
    const typed = prompt(
      `Permanently delete ${userEmail}? Their identity is scrubbed from audit logs and they're removed from every org + agency. Type the email to confirm:`,
    );
    if (typed?.toLowerCase() !== userEmail.toLowerCase()) {
      if (typed != null) toast.error("Email didn't match. Nothing deleted.");
      return;
    }
    startTransition(async () => {
      const result = await deleteUserAction({ userId });
      if (result.ok) {
        toast.success("User deleted");
        router.push("/arbor/users");
      } else {
        toast.error(result.error.message);
      }
    });
  };

  return (
    <section className="space-y-6">
      {/* Recovery actions */}
      <div className="border-border bg-background space-y-3 rounded-xl border p-5">
        <h2 className="text-foreground text-base font-bold">Account recovery</h2>
        <p className="text-muted-foreground text-xs">
          Use these when a user is locked out or never received their original email.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleResetPassword}
            disabled={pending}
            className="border-border text-foreground hover:bg-surface rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            Send password-reset email
          </button>
          <button
            type="button"
            onClick={handleMagicLink}
            disabled={pending}
            className="border-border text-foreground hover:bg-surface rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            Send magic-link sign-in
          </button>
          <button
            type="button"
            onClick={handleForceSignOut}
            disabled={pending}
            className="border-border text-foreground hover:bg-surface rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            Force sign-out everywhere
          </button>
        </div>
      </div>

      {/* Danger zone */}
      <div className="border-destructive/30 bg-destructive/5 space-y-4 rounded-xl border p-5">
        <h2 className="text-foreground text-base font-bold">Danger zone</h2>

        {isSuspended ? (
          <div>
            <p className="text-foreground text-sm">This user is currently suspended.</p>
            <button
              type="button"
              onClick={handleUnsuspend}
              disabled={pending}
              className="border-border text-foreground hover:bg-surface mt-2 rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              {pending ? "Restoring…" : "Restore sign-in"}
            </button>
          </div>
        ) : (
          <div>
            <p className="text-foreground text-sm">Suspend this user.</p>
            <p className="text-muted-foreground mt-1 text-xs">
              They lose the ability to sign in. Existing sessions are not killed unless you also
              force sign-out.
            </p>
            <button
              type="button"
              onClick={handleSuspend}
              disabled={pending}
              className="mt-2 rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Suspending…" : "Suspend user"}
            </button>
          </div>
        )}

        <hr className="border-destructive/20" />

        <div>
          <p className="text-foreground text-sm font-medium">Delete this user</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Permanent. Removes them from every org and agency. Audit log entries they created stay
            but are scrubbed of their identity.
          </p>
          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            className="bg-destructive text-destructive-foreground mt-2 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            Delete user…
          </button>
        </div>
      </div>
    </section>
  );
}
