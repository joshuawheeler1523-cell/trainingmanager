"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRightStartOnRectangleIcon,
  TrashIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import {
  deleteAccountAction,
  signOutEverywhereAction,
  updateEmailAction,
  updateProfileAction,
} from "./profile-actions";

const fieldClass =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

type Memberships = {
  orgs: { id: string; name: string; role: string }[];
  agencies: { id: string; name: string; role: string }[];
};

export default function AccountForms({
  initialFullName,
  initialEmail,
  memberships,
}: {
  initialFullName: string;
  initialEmail: string;
  memberships: Memberships;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fullName, setFullName] = useState(initialFullName);
  const [newEmail, setNewEmail] = useState("");
  const [showDelete, setShowDelete] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");

  const handleProfileSave = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await updateProfileAction({ fullName });
      if (result.ok) {
        toast.success("Profile updated");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  const handleEmailChange = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    startTransition(async () => {
      const result = await updateEmailAction({ email: newEmail });
      if (result.ok) {
        toast.success(`Confirmation link sent to ${newEmail}. Click it to complete the change.`);
        setNewEmail("");
      } else {
        toast.error(result.error.message);
      }
    });
  };

  const handleSignOutAll = () => {
    if (!confirm("Sign out of all devices? You'll need to sign back in everywhere.")) return;
    startTransition(async () => {
      await signOutEverywhereAction();
    });
  };

  const handleDelete = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!confirm("Permanently delete your account? This cannot be undone.")) return;
    startTransition(async () => {
      const result = await deleteAccountAction({ confirmEmail });
      if (!result.ok) {
        toast.error(result.error.message);
      }
      // On success the action redirects, so nothing else needed here.
    });
  };

  return (
    <div className="space-y-6">
      {/* Profile name */}
      <form onSubmit={handleProfileSave} className="space-y-3">
        <div>
          <label htmlFor="full-name" className="text-foreground mb-1 block text-sm font-medium">
            Full name
          </label>
          <input
            id="full-name"
            type="text"
            value={fullName}
            onChange={(e) => {
              setFullName(e.target.value);
            }}
            className={fieldClass}
            required
          />
        </div>
        <button
          type="submit"
          disabled={pending || !fullName.trim() || fullName === initialFullName}
          className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save profile"}
        </button>
      </form>

      <hr className="border-border" />

      {/* Email change */}
      <div>
        <p className="text-foreground text-sm font-medium">Email</p>
        <p className="text-muted-foreground mt-1 text-xs">
          Current: <span className="text-foreground font-mono">{initialEmail}</span>
        </p>
        <form onSubmit={handleEmailChange} className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-1">
            <label htmlFor="new-email" className="text-foreground mb-1 block text-xs font-medium">
              Change to
            </label>
            <input
              id="new-email"
              type="email"
              value={newEmail}
              onChange={(e) => {
                setNewEmail(e.target.value);
              }}
              placeholder="new@example.com"
              className={fieldClass}
            />
          </div>
          <button
            type="submit"
            disabled={pending || !newEmail.trim()}
            className="border-border text-foreground hover:bg-surface rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            Send confirmation
          </button>
        </form>
        <p className="text-muted-foreground mt-2 text-xs">
          We&apos;ll send a confirmation link to the new address. The change only takes effect when
          you click it.
        </p>
      </div>

      <hr className="border-border" />

      {/* Sessions */}
      <div>
        <p className="text-foreground text-sm font-medium">Sessions</p>
        <p className="text-muted-foreground mt-1 text-xs">
          Sign out of every device you&apos;re currently signed in on. Useful if you lost a device
          or suspect your credentials leaked.
        </p>
        <button
          type="button"
          onClick={handleSignOutAll}
          disabled={pending}
          className="border-border text-foreground hover:bg-surface mt-3 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          <ArrowRightStartOnRectangleIcon className="h-4 w-4" />
          Sign out everywhere
        </button>
      </div>

      <hr className="border-border" />

      {/* Memberships summary */}
      <div>
        <p className="text-foreground text-sm font-medium">Your memberships</p>
        <p className="text-muted-foreground mt-1 text-xs">
          You&apos;ll be removed from these if you delete your account.
        </p>
        <div className="mt-3 space-y-2 text-sm">
          {memberships.orgs.length === 0 && memberships.agencies.length === 0 ? (
            <p className="text-muted-foreground italic">No active memberships.</p>
          ) : (
            <>
              {memberships.orgs.map((o) => (
                <div key={o.id} className="flex items-center justify-between">
                  <span className="text-foreground">{o.name}</span>
                  <span className="text-muted-foreground text-xs">{o.role}</span>
                </div>
              ))}
              {memberships.agencies.map((a) => (
                <div key={a.id} className="flex items-center justify-between">
                  <span className="text-foreground">{a.name}</span>
                  <span className="text-muted-foreground text-xs">{a.role} · agency</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      <hr className="border-border" />

      {/* Danger zone */}
      <div className="border-destructive/30 bg-destructive/5 rounded-lg border p-4">
        <div className="flex items-start gap-3">
          <ExclamationTriangleIcon className="text-destructive mt-0.5 h-5 w-5 shrink-0" />
          <div className="flex-1">
            <p className="text-foreground text-sm font-semibold">Delete account</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Permanent. We&apos;ll remove your sign-in, scrub your identity from audit logs, and
              remove you from every org and agency. Records you uploaded inside an organization
              (instructors, classes, projects, etc.) belong to the organization and stay there.
            </p>
            {!showDelete ? (
              <button
                type="button"
                onClick={() => {
                  setShowDelete(true);
                }}
                className="text-destructive mt-3 inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
              >
                <TrashIcon className="h-4 w-4" />
                Delete my account…
              </button>
            ) : (
              <form onSubmit={handleDelete} className="mt-3 space-y-3">
                <div>
                  <label
                    htmlFor="confirm-email"
                    className="text-foreground mb-1 block text-xs font-medium"
                  >
                    Type <span className="text-foreground font-mono">{initialEmail}</span> to
                    confirm
                  </label>
                  <input
                    id="confirm-email"
                    type="email"
                    required
                    value={confirmEmail}
                    onChange={(e) => {
                      setConfirmEmail(e.target.value);
                    }}
                    className={fieldClass}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={pending || confirmEmail.toLowerCase() !== initialEmail.toLowerCase()}
                    className="bg-destructive text-destructive-foreground rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
                  >
                    {pending ? "Deleting…" : "Permanently delete"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowDelete(false);
                      setConfirmEmail("");
                    }}
                    className="text-muted-foreground hover:text-foreground text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
