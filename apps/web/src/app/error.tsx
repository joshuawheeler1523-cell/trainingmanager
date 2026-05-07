"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
      <h2 className="text-foreground text-xl font-semibold">Something went wrong</h2>
      <p className="text-muted-foreground max-w-sm text-sm">
        An unexpected error occurred. We&apos;ve logged it and will investigate.
      </p>
      {error.digest && (
        <p className="text-muted-foreground font-mono text-xs">Ref: {error.digest}</p>
      )}
      <button
        onClick={reset}
        className="bg-primary text-primary-foreground mt-2 rounded-md px-4 py-2 text-sm font-medium hover:opacity-90"
      >
        Try again
      </button>
    </div>
  );
}
