"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircleIcon } from "@heroicons/react/20/solid";
import { acceptInvitationAction, acceptInvitationWithPassword } from "./actions";

// Two surfaces in one file: SetPasswordForm for the unauthed primary flow,
// AcceptForm (legacy) for the already-signed-in matching-email case.

export function SetPasswordForm({ token, email }: { token: string; email: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    startTransition(async () => {
      // Happy path redirects server-side and the await never resolves; only
      // error results reach this code path, so we can read `error` directly.
      const result = await acceptInvitationWithPassword(token, password);
      setError(result.error.message);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <div>
        <label className="text-foreground mb-1.5 block text-sm font-medium" htmlFor="invite-email">
          Email
        </label>
        <input
          id="invite-email"
          type="email"
          value={email}
          readOnly
          className="border-input bg-surface text-muted-foreground w-full rounded-md border px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label
          className="text-foreground mb-1.5 block text-sm font-medium"
          htmlFor="invite-password"
        >
          Choose a password
        </label>
        <div className="relative">
          <input
            id="invite-password"
            type={show ? "text" : "password"}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
            }}
            required
            minLength={8}
            autoComplete="new-password"
            className="border-input bg-background text-foreground focus-visible:ring-ring w-full rounded-md border px-3 py-2 pr-16 text-sm focus:outline-none focus-visible:ring-2"
          />
          <button
            type="button"
            onClick={() => {
              setShow((s) => !s);
            }}
            className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-2 px-1 text-xs"
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? "Hide" : "Show"}
          </button>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">At least 8 characters.</p>
      </div>

      <div>
        <label
          className="text-foreground mb-1.5 block text-sm font-medium"
          htmlFor="invite-password-confirm"
        >
          Confirm password
        </label>
        <input
          id="invite-password-confirm"
          type={show ? "text" : "password"}
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
          }}
          required
          autoComplete="new-password"
          className="border-input bg-background text-foreground focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2"
        />
      </div>

      {error && (
        <p className="text-sm" style={{ color: "var(--destructive)" }} role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="bg-primary text-primary-foreground hover:bg-primary/90 w-full rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50"
      >
        {pending ? "Setting up…" : "Set password & continue"}
      </button>
    </form>
  );
}

// Legacy path: signed-in user with matching email accepts without setting a
// new password. Kept for the rare case where someone is already authed and
// receives an invite for the same email.
export default function AcceptForm({ token }: { token: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleAccept() {
    startTransition(async () => {
      const result = await acceptInvitationAction(token);
      if (result.ok) {
        toast.success("Welcome aboard!");
        router.push("/");
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={handleAccept}
      className="bg-primary text-primary-foreground hover:bg-primary/90 mt-4 inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
    >
      <CheckCircleIcon className="h-4 w-4" />
      {pending ? "Accepting…" : "Accept invitation"}
    </button>
  );
}
