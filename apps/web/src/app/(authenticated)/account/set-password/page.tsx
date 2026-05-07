"use client";

import { useActionState } from "react";
import { setPassword, type SetPasswordState } from "./actions";

export default function SetPasswordPage() {
  const [state, action, pending] = useActionState<SetPasswordState, FormData>(setPassword, {});

  if (state.success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <div className="mb-4 text-4xl">✓</div>
          <h1 className="mb-2 text-xl font-semibold text-gray-900">Password set</h1>
          <p className="text-sm text-gray-500">You can now sign in with your email and password.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-2xl font-semibold text-gray-900">Set a password</h1>
        <p className="mb-6 text-sm text-gray-500">
          Once set, you can sign in with email + password in addition to magic links.
        </p>
        <form action={action} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">New password</label>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Confirm password</label>
            <input
              name="confirm"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Set password"}
          </button>
        </form>
      </div>
    </div>
  );
}
