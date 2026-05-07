"use client";

import { useEffect } from "react";

export default function AuthenticatedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[AuthError]", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 p-12 text-center">
      <h2 className="text-foreground text-base font-semibold">Something went wrong</h2>
      <p className="text-muted-foreground max-w-sm text-sm">
        This page encountered an error. Try again or contact support if the problem persists.
      </p>
      {error.digest && (
        <p className="text-muted-foreground font-mono text-xs">Ref: {error.digest}</p>
      )}
      <button
        onClick={reset}
        className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90"
      >
        Try again
      </button>
    </div>
  );
}
