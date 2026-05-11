"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { setNewPassword, type SetPasswordState } from "../actions";
import { createClient } from "@/lib/supabase/client";
import LegalFooter from "@/components/legal/legal-footer";

export default function ResetConfirmPage() {
  const router = useRouter();
  const [state, action, pending] = useActionState<SetPasswordState, FormData>(setNewPassword, {});
  const [recoveryReady, setRecoveryReady] = useState<"checking" | "ready" | "missing">("checking");

  // Supabase's password-reset link drops a #access_token / #refresh_token
  // hash on this page, then the JS SDK auto-handles it via onAuthStateChange.
  // We listen for the PASSWORD_RECOVERY event to know we're ready to accept
  // a new password. If no recovery session ever arrives, we tell the user
  // the link is invalid or expired.
  useEffect(() => {
    const supabase = createClient();
    const checkSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        setRecoveryReady("ready");
      } else {
        // Give the SDK a beat to process the hash on first paint
        setTimeout(() => {
          void (async () => {
            const {
              data: { session: s2 },
            } = await supabase.auth.getSession();
            setRecoveryReady(s2 ? "ready" : "missing");
          })();
        }, 800);
      }
    };
    void checkSession();

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setRecoveryReady("ready");
      }
    });
    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (state.ok) {
      // After successful password change, send them to the dashboard.
      // The recovery session is a real session so they're already signed in.
      const t = setTimeout(() => {
        router.push("/dashboard");
      }, 1500);
      return () => {
        clearTimeout(t);
      };
    }
    return undefined;
  }, [state.ok, router]);

  return (
    <div className="bg-canvas flex min-h-screen flex-col">
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="border-border bg-background w-full max-w-sm rounded-xl border p-8 shadow-sm">
          {state.ok ? (
            <div className="text-center">
              <p className="text-foreground text-2xl">✓</p>
              <h1 className="text-foreground mt-3 font-serif text-2xl tracking-tight">
                Password updated
              </h1>
              <p className="text-muted-foreground mt-3 text-sm">
                Redirecting you to your dashboard…
              </p>
            </div>
          ) : recoveryReady === "checking" ? (
            <p className="text-muted-foreground text-sm">Checking your link…</p>
          ) : recoveryReady === "missing" ? (
            <div className="text-center">
              <h1 className="text-foreground font-serif text-2xl tracking-tight">Link expired</h1>
              <p className="text-muted-foreground mt-3 text-sm">
                This password-reset link is invalid or has expired. Request a new one.
              </p>
              <Link
                href="/auth/reset"
                className="bg-primary text-primary-foreground mt-6 inline-block rounded-md px-4 py-2 text-sm font-medium"
              >
                Send a new link
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-foreground font-serif text-2xl tracking-tight">
                Set a new password
              </h1>
              <p className="text-muted-foreground mt-2 text-sm">
                At least 8 characters. We don&apos;t enforce special-character requirements — just
                pick something long and not reused.
              </p>
              <form action={action} className="mt-6 space-y-4">
                <div>
                  <label
                    htmlFor="new-password"
                    className="text-foreground mb-1.5 block text-sm font-medium"
                  >
                    New password
                  </label>
                  <input
                    id="new-password"
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="border-input bg-background text-foreground w-full rounded-lg border px-3.5 py-2.5 text-sm shadow-sm focus:outline-none"
                  />
                </div>
                {state.error && (
                  <p className="text-destructive text-sm" role="alert">
                    {state.error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={pending}
                  className="bg-primary text-primary-foreground w-full rounded-lg py-2.5 text-sm font-medium disabled:opacity-60"
                >
                  {pending ? "Saving…" : "Update password"}
                </button>
              </form>
            </>
          )}
        </div>
      </main>
      <LegalFooter />
    </div>
  );
}
