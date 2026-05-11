"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { discoverSsoForEmail, sendMagicLink, signInWithPassword, startSsoSignIn } from "./actions";

export type LoginBrand = {
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  isAgency: boolean;
};

type Phase = "idle" | "checking" | "submitting";

export default function LoginForm({ brand }: { brand: LoginBrand }) {
  const router = useRouter();
  const [mode, setMode] = useState<"magic" | "password">("magic");
  const [phase, setPhase] = useState<Phase>("idle");
  const [magicSentTo, setMagicSentTo] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // SSO check happens on form submit: we look up the email's domain in
  // sso_configs first; if a provider id is registered + enabled we
  // dispatch to the IdP via signInWithSSO, otherwise we fall through to
  // the magic-link / password flow the user picked.
  //
  // Why call the server actions directly (not via useActionState)? Calling
  // an action-state dispatcher imperatively from inside a useTransition
  // double-wraps the action and (a) hangs the pending state on "Checking…"
  // and (b) swallows the redirect() from signInWithPassword. Direct calls
  // let us own the pending state and navigate explicitly on success.
  const handleEmailSubmit = (
    e: React.SyntheticEvent<HTMLFormElement>,
    submitMode: "magic" | "password",
  ) => {
    // Always preventDefault so a missing email or pre-validation bail-out
    // doesn't trigger a native form submit (the form has no action= and
    // the browser would do a full-page reload to the same URL).
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const email = (fd.get("email") as string | null)?.trim() ?? "";
    if (!email.includes("@")) return; // native required + type=email handle the message

    setErrorMessage(null);
    setPhase("checking");

    startTransition(async () => {
      // SSO discovery is best-effort. If the RPC errors (RLS, missing
      // migration on a preview deploy, network blip) or takes longer
      // than 2.5s, we fall through to the user's chosen flow rather
      // than trap them on "Checking…" with no exit. Most users don't
      // have SSO configured and shouldn't pay any UX cost for it.
      let sso: Awaited<ReturnType<typeof discoverSsoForEmail>> = null;
      try {
        sso = await Promise.race([
          discoverSsoForEmail(email),
          new Promise<null>((resolve) => {
            setTimeout(() => {
              resolve(null);
            }, 2500);
          }),
        ]);
      } catch (err) {
        console.warn("[login] SSO discovery failed, falling through:", err);
      }
      if (sso) {
        try {
          await startSsoSignIn(sso.providerId);
          return;
        } catch (err) {
          console.warn("[login] SSO sign-in failed, falling through:", err);
        }
      }

      setPhase("submitting");
      if (submitMode === "magic") {
        const result = await sendMagicLink({ status: "idle" }, fd);
        if (result.status === "sent") {
          setMagicSentTo(result.email);
        } else if (result.status === "error") {
          setErrorMessage(result.message);
        }
        setPhase("idle");
      } else {
        const result = await signInWithPassword({}, fd);
        // signInWithPassword redirects on success, so on a happy path
        // we never get a value back. If we do, it's an error state.
        if (result.error) {
          setErrorMessage(result.error);
          setPhase("idle");
        } else {
          // Server-action redirect didn't fire (rare) but the auth cookie
          // is set — navigate explicitly so we never strand the user here.
          router.replace("/");
          router.refresh();
        }
      }
    });
  };

  const isBusy = phase !== "idle";

  const accent = brand.isAgency ? brand.primaryColor : "#8FA68E";

  return (
    <div
      className="bg-background grid min-h-screen lg:grid-cols-[1.1fr_1fr]"
      style={
        brand.isAgency
          ? ({ "--brand-primary": brand.primaryColor } as React.CSSProperties)
          : undefined
      }
    >
      {/* ── Left: artwork (agency logo on tinted backdrop, or Arbor mark) ── */}
      <aside
        aria-hidden="true"
        className="relative hidden overflow-hidden lg:flex lg:items-center lg:justify-center"
        style={{
          backgroundColor: "#1a1a1a",
          backgroundImage: brand.isAgency
            ? `radial-gradient(circle at 30% 40%, ${brand.primaryColor}33, transparent 60%), radial-gradient(circle at 70% 70%, ${brand.primaryColor}1f, transparent 55%)`
            : "radial-gradient(circle at 30% 40%, rgba(143,166,142,0.18), transparent 60%), radial-gradient(circle at 70% 70%, rgba(212,165,116,0.12), transparent 55%)",
        }}
      >
        <div className="relative w-full max-w-md px-10">
          {brand.isAgency && brand.logoUrl ? (
            <div className="flex flex-col items-center">
              <Image
                src={brand.logoUrl}
                alt={brand.name}
                width={420}
                height={180}
                priority
                unoptimized
                className="h-auto max-h-48 w-auto max-w-full object-contain"
              />
            </div>
          ) : (
            <div
              className="rounded-2xl shadow-2xl ring-1 ring-white/5"
              style={{ boxShadow: "0 30px 80px -20px rgba(0,0,0,0.6)" }}
            >
              <Image
                src="/branding/arbor-mark.png"
                alt="Arbor — Training Resource Management"
                width={1024}
                height={1024}
                priority
                sizes="(min-width: 1024px) 35vw, 0px"
                className="h-auto w-full rounded-2xl"
              />
            </div>
          )}
          <p
            className="mt-6 text-center text-[11px] uppercase tracking-[0.32em]"
            style={{ color: accent }}
          >
            {brand.isAgency ? brand.name : "Training operations · for hospitals"}
          </p>
        </div>
      </aside>

      {/* ── Right: form panel ─────────────────────────────────────────────── */}
      <main className="flex flex-col items-center justify-center px-6 py-12 sm:px-10">
        {/* Mobile header (artwork is hidden on small screens) */}
        <div className="mb-8 flex items-center gap-3 lg:hidden">
          {brand.isAgency && brand.logoUrl ? (
            <Image
              src={brand.logoUrl}
              alt={brand.name}
              width={160}
              height={48}
              unoptimized
              className="h-10 w-auto object-contain"
            />
          ) : (
            <>
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
            </>
          )}
        </div>

        <div className="w-full max-w-sm">
          {magicSentTo ? (
            <SentCard email={magicSentTo} />
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
                <form
                  onSubmit={(e) => {
                    handleEmailSubmit(e, "magic");
                  }}
                  className="space-y-5"
                >
                  <Field
                    id="login-magic-email"
                    name="email"
                    type="email"
                    label="Email"
                    autoComplete="email"
                  />
                  {errorMessage && <ErrorText>{errorMessage}</ErrorText>}
                  <PrimaryButton
                    pending={isBusy}
                    pendingLabel={phase === "checking" ? "Checking…" : "Sending…"}
                    brand={brand}
                  >
                    Send magic link
                  </PrimaryButton>
                </form>
              ) : (
                <form
                  onSubmit={(e) => {
                    handleEmailSubmit(e, "password");
                  }}
                  className="space-y-5"
                >
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
                  {errorMessage && <ErrorText>{errorMessage}</ErrorText>}
                  <PrimaryButton
                    pending={isBusy}
                    pendingLabel={phase === "checking" ? "Checking…" : "Signing in…"}
                    brand={brand}
                  >
                    Sign in
                  </PrimaryButton>
                </form>
              )}

              <div className="mt-6 flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setErrorMessage(null);
                    setMode(mode === "magic" ? "password" : "magic");
                  }}
                  className="text-muted-foreground text-sm underline-offset-4 transition-colors hover:underline"
                  style={{ textDecorationColor: "var(--highlight)" }}
                >
                  {mode === "magic"
                    ? "Sign in with password instead"
                    : "Send me a magic link instead"}
                </button>
                {mode === "password" && (
                  <a
                    href="/auth/reset"
                    className="text-muted-foreground text-xs underline-offset-4 hover:underline"
                  >
                    Forgot password?
                  </a>
                )}
              </div>
            </>
          )}
        </div>

        <p className="text-muted-foreground mt-12 text-center text-xs">
          {brand.isAgency
            ? `${brand.name} · powered by Arbor`
            : "Arbor · Training Resource Management"}
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
  brand,
  children,
}: {
  pending: boolean;
  pendingLabel: string;
  brand: LoginBrand;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-primary-foreground w-full rounded-lg py-2.5 text-sm font-medium tracking-wide shadow-sm transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      style={{ backgroundColor: brand.isAgency ? brand.primaryColor : "var(--primary)" }}
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
