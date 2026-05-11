"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import LegalFooter from "@/components/legal/legal-footer";

/**
 * Email verification landing page. Supabase's email-confirmation links
 * land here; the JS SDK processes the hash and signs the user in.
 * This page just shows status + a link forward.
 */
export default function VerifyPage() {
  const [state, setState] = useState<"checking" | "verified" | "failed">("checking");

  useEffect(() => {
    const supabase = createClient();
    const check = async () => {
      // Give the SDK a moment to process the URL hash
      await new Promise<void>((r) => {
        setTimeout(r, 800);
      });
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setState(session ? "verified" : "failed");
    };
    void check();
  }, []);

  return (
    <div className="bg-canvas flex min-h-screen flex-col">
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="border-border bg-background w-full max-w-sm rounded-xl border p-8 text-center shadow-sm">
          {state === "checking" && (
            <p className="text-muted-foreground text-sm">Verifying your email…</p>
          )}
          {state === "verified" && (
            <>
              <p className="text-foreground text-2xl">✓</p>
              <h1 className="text-foreground mt-3 font-serif text-2xl tracking-tight">
                Email verified
              </h1>
              <p className="text-muted-foreground mt-3 text-sm">
                You&apos;re signed in. Continue to your dashboard.
              </p>
              <Link
                href="/dashboard"
                className="bg-primary text-primary-foreground mt-6 inline-block rounded-md px-4 py-2 text-sm font-medium"
              >
                Go to dashboard
              </Link>
            </>
          )}
          {state === "failed" && (
            <>
              <h1 className="text-foreground font-serif text-2xl tracking-tight">Link expired</h1>
              <p className="text-muted-foreground mt-3 text-sm">
                This verification link is invalid or has expired. Sign in to request a new one.
              </p>
              <Link
                href="/login"
                className="bg-primary text-primary-foreground mt-6 inline-block rounded-md px-4 py-2 text-sm font-medium"
              >
                Sign in
              </Link>
            </>
          )}
        </div>
      </main>
      <LegalFooter />
    </div>
  );
}
