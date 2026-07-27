"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * Last-resort boundary for errors thrown by the root layout itself, which
 * `app/error.tsx` cannot catch. It replaces the whole document, so it has to
 * render its own <html>/<body> and cannot rely on the layout's fonts or
 * theme attribute — hence the inline styles.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          display: "flex",
          minHeight: "100vh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: "2rem",
        }}
      >
        <h2 style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>Something went wrong</h2>
        <p style={{ maxWidth: "28rem", fontSize: "0.875rem", color: "#666", margin: 0 }}>
          The application failed to load. The error has been logged.
        </p>
        {error.digest && (
          <p style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "#999", margin: 0 }}>
            Ref: {error.digest}
          </p>
        )}
        <a
          href="/"
          style={{
            marginTop: "0.5rem",
            borderRadius: "0.375rem",
            border: "1px solid #ccc",
            padding: "0.5rem 1rem",
            fontSize: "0.875rem",
            textDecoration: "none",
            color: "inherit",
          }}
        >
          Reload
        </a>
      </body>
    </html>
  );
}
