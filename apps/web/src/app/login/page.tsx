"use client";

import Image from "next/image";
import { useActionState, useState } from "react";
import {
  sendMagicLink,
  signInWithPassword,
  type MagicLinkState,
  type PasswordState,
} from "./actions";

export default function LoginPage() {
  const [mode, setMode] = useState<"magic" | "password">("magic");
  const [magicState, magicAction, magicPending] = useActionState<MagicLinkState, FormData>(
    sendMagicLink,
    { status: "idle" },
  );
  const [passState, passAction, passPending] = useActionState<PasswordState, FormData>(
    signInWithPassword,
    {},
  );

  return (
    <div className="bg-background grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* ── Left: artwork ─────────────────────────────────────────────────── */}
      <aside
        aria-hidden="true"
        className="relative hidden overflow-hidden lg:block"
        style={{ backgroundColor: "#1a1a1a" }}
      >
        <Image
          src="/branding/arbor-hero.png"
          alt=""
          fill
          priority
          sizes="(min-width: 1024px) 55vw, 0px"
          className="object-cover"
        />
        {/* Subtle gradient to ground the bottom edge */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/40 to-transparent"
        />
      </aside>

      {/* ── Right: form panel ─────────────────────────────────────────────── */}
      <main className="flex flex-col items-center justify-center px-6 py-12 sm:px-10">
        {/* Mobile logo (artwork is hidden on small screens) */}
        <div className="mb-8 flex items-center gap-3 lg:hidden">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full"
            style={{ backgroundColor: "var(--primary)" }}
          >
            <span style={{ color: "var(--highlight)" }} className="font-serif text-lg">
              A
            </span>
          </div>
          <div>
            <p className="text-foreground font-serif text-lg tracking-tight">Arbor</p>
            <p className="text-muted-foreground text-[10px] uppercase tracking-[0.18em]">
              Training Resource Management
            </p>
          </div>
        </div>

        <div className="w-full max-w-sm">
          {magicState.status === "sent" ? (
            <SentCard email={magicState.email} />
          ) : (
            <>
              <header className="mb-8">
                <h1 className="text-foreground font-serif text-3xl tracking-tight">Welcome back</h1>
                <p className="text-muted-foreground mt-2 text-sm">
                  {mode === "magic"
                    ? "Enter your email and we'll send you a magic link."
                    : "Sign in with your email and password."}
                </p>
              </header>

              {mode === "magic" ? (
                <form action={magicAction} className="space-y-5">
                  <Field
                    id="login-magic-email"
                    name="email"
                    type="email"
                    label="Email"
                    autoComplete="email"
                  />
                  {magicState.status === "error" && <ErrorText>{magicState.message}</ErrorText>}
                  <PrimaryButton pending={magicPending} pendingLabel="Sending…">
                    Send magic link
                  </PrimaryButton>
                </form>
              ) : (
                <form action={passAction} className="space-y-5">
                  <Field
                    id="login-password-email"
                    name="email"
                    type="email"
                    label="Email"
                    autoComplete="email"
                  />
                  <Field
                    id="login-password-password"
                    name="password"
                    type="password"
                    label="Password"
                    autoComplete="current-password"
                  />
                  {passState.error && <ErrorText>{passState.error}</ErrorText>}
                  <PrimaryButton pending={passPending} pendingLabel="Signing in…">
                    Sign in
                  </PrimaryButton>
                </form>
              )}

              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === "magic" ? "password" : "magic");
                  }}
                  className="text-muted-foreground text-sm underline-offset-4 transition-colors hover:underline"
                  style={{ textDecorationColor: "var(--highlight)" }}
                >
                  {mode === "magic"
                    ? "Sign in with password instead"
                    : "Send me a magic link instead"}
                </button>
              </div>
            </>
          )}
        </div>

        <p className="text-muted-foreground mt-12 text-center text-xs">
          Arbor &middot; Training Resource Management
        </p>
      </main>
    </div>
  );
}

function Field({
  id,
  name,
  type,
  label,
  autoComplete,
}: {
  id: string;
  name: string;
  type: string;
  label: string;
  autoComplete?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-foreground mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required
        autoComplete={autoComplete}
        className="border-input bg-background text-foreground placeholder:text-muted-foreground w-full rounded-lg border px-3.5 py-2.5 text-sm shadow-sm transition-colors focus:outline-none focus-visible:border-transparent"
        style={{ outline: "none" }}
      />
    </div>
  );
}

function PrimaryButton({
  pending,
  pendingLabel,
  children,
}: {
  pending: boolean;
  pendingLabel: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-primary text-primary-foreground w-full rounded-lg py-2.5 text-sm font-medium tracking-wide shadow-sm transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm" style={{ color: "var(--destructive)" }} role="alert">
      {children}
    </p>
  );
}

function SentCard({ email }: { email: string }) {
  return (
    <div className="text-center">
      <div
        className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full"
        style={{ backgroundColor: "var(--surface)" }}
      >
        <span style={{ color: "var(--highlight)" }} className="text-2xl">
          ✦
        </span>
      </div>
      <h1 className="text-foreground font-serif text-2xl tracking-tight">Check your inbox</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        We sent a sign-in link to <span className="text-foreground font-medium">{email}</span>.
      </p>
      <button
        onClick={() => {
          window.location.reload();
        }}
        className="text-muted-foreground mt-8 text-sm underline-offset-4 hover:underline"
        style={{ textDecorationColor: "var(--highlight)" }}
      >
        Use a different email
      </button>
    </div>
  );
}
