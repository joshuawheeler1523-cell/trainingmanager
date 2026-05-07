"use client";

import { useActionState } from "react";
import PageHeader from "@/components/ui/page-header";
import { setPassword, type SetPasswordState } from "./actions";

export default function SetPasswordPage() {
  const [state, action, pending] = useActionState<SetPasswordState, FormData>(setPassword, {});

  if (state.success) {
    return (
      <div>
        <PageHeader title="Set Password" />
        <div className="p-6">
          <div className="border-border bg-background max-w-sm rounded-xl border p-8 text-center">
            <div className="mb-3 text-2xl">✓</div>
            <h2 className="text-foreground mb-1 text-base font-semibold">Password set</h2>
            <p className="text-muted-foreground text-sm">
              You can now sign in with your email and password.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Set Password"
        description="Set a password to sign in without a magic link."
      />
      <div className="p-6">
        <div className="border-border bg-background max-w-sm rounded-xl border p-6">
          <form action={action} className="space-y-4">
            <div>
              <label className="text-foreground mb-1 block text-sm font-medium">New password</label>
              <input
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className="border-input bg-background text-foreground focus:ring-ring w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2"
              />
            </div>
            <div>
              <label className="text-foreground mb-1 block text-sm font-medium">
                Confirm password
              </label>
              <input
                name="confirm"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className="border-input bg-background text-foreground focus:ring-ring w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2"
              />
            </div>
            {state.error && <p className="text-destructive text-sm">{state.error}</p>}
            <button
              type="submit"
              disabled={pending}
              className="bg-primary text-primary-foreground w-full rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Saving…" : "Set password"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
