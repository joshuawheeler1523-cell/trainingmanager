"use client";

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

  if (magicState.status === "sent") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <div className="mb-4 text-4xl">📬</div>
          <h1 className="mb-2 text-xl font-semibold text-gray-900">Check your email</h1>
          <p className="text-sm text-gray-500">
            We sent a magic link to{" "}
            <span className="font-medium text-gray-700">{magicState.email}</span>. Click the link to
            sign in.
          </p>
          <button
            onClick={() => {
              window.location.reload();
            }}
            className="mt-6 text-sm text-blue-600 hover:underline"
          >
            Use a different email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-2xl font-semibold text-gray-900">Sign in to Arbor</h1>
        <p className="mb-6 text-sm text-gray-500">
          {mode === "magic"
            ? "Enter your email and we'll send you a magic link."
            : "Enter your email and password."}
        </p>

        {mode === "magic" ? (
          <form action={magicAction} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {magicState.status === "error" && (
              <p className="text-sm text-red-600">{magicState.message}</p>
            )}
            <button
              type="submit"
              disabled={magicPending}
              className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {magicPending ? "Sending…" : "Send Magic Link"}
            </button>
          </form>
        ) : (
          <form action={passAction} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Password</label>
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {passState.error && <p className="text-sm text-red-600">{passState.error}</p>}
            <button
              type="submit"
              disabled={passPending}
              className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {passPending ? "Signing in…" : "Sign in"}
            </button>
          </form>
        )}

        <div className="mt-4 text-center">
          <button
            onClick={() => {
              setMode(mode === "magic" ? "password" : "magic");
            }}
            className="text-sm text-blue-600 hover:underline"
          >
            {mode === "magic" ? "Sign in with password instead" : "Send me a magic link instead"}
          </button>
        </div>
      </div>
    </div>
  );
}
