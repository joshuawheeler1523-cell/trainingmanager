"use client";

import Link from "next/link";
import { useActionState } from "react";
import { sendPasswordReset, type ResetRequestState } from "./actions";
import LegalFooter from "@/components/legal/legal-footer";

export default function ResetPasswordPage() {
  const [state, action, pending] = useActionState<ResetRequestState, FormData>(sendPasswordReset, {
    status: "idle",
  });

  return (
    <div className="bg-canvas flex min-h-screen flex-col">
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="border-border bg-background w-full max-w-sm rounded-xl border p-8 shadow-sm">
          {state.status === "sent" ? (
            <div className="text-center">
              <p className="text-foreground text-2xl">✓</p>
              <h1 className="text-foreground mt-3 font-serif text-2xl tracking-tight">
                Check your inbox
              </h1>
              <p className="text-muted-foreground mt-3 text-sm">
                If an account exists for{" "}
                <span className="text-foreground font-medium">{state.email}</span>, we sent a
                password-reset link. The link is valid for 1 hour.
              </p>
              <p className="text-muted-foreground mt-6 text-xs">
                Didn&apos;t receive it? Check spam, or{" "}
                <button
                  type="button"
                  onClick={() => {
                    window.location.reload();
                  }}
                  className="text-primary underline"
                >
                  try a different email
                </button>
                .
              </p>
            </div>
          ) : (
            <>
              <h1 className="text-foreground font-serif text-2xl tracking-tight">
                Reset your password
              </h1>
              <p className="text-muted-foreground mt-2 text-sm">
                Enter the email on your account. We&apos;ll send a link to set a new password.
              </p>
              <form action={action} className="mt-6 space-y-4">
                <div>
                  <label
                    htmlFor="reset-email"
                    className="text-foreground mb-1.5 block text-sm font-medium"
                  >
                    Email
                  </label>
                  <input
                    id="reset-email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    className="border-input bg-background text-foreground w-full rounded-lg border px-3.5 py-2.5 text-sm shadow-sm focus:outline-none"
                  />
                </div>
                {state.status === "error" && (
                  <p className="text-destructive text-sm" role="alert">
                    {state.message}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={pending}
                  className="bg-primary text-primary-foreground w-full rounded-lg py-2.5 text-sm font-medium disabled:opacity-60"
                >
                  {pending ? "Sending…" : "Send reset link"}
                </button>
              </form>
              <p className="text-muted-foreground mt-6 text-center text-xs">
                <Link href="/login" className="text-primary underline">
                  Back to sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </main>
      <LegalFooter />
    </div>
  );
}
