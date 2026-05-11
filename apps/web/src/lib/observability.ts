import "server-only";

/**
 * Thin error-reporting + breadcrumb abstraction with a no-op fallback.
 *
 * Designed so wiring up Sentry (or any equivalent — Highlight, Bugsnag,
 * Rollbar) is a 10-line change in one file. We deliberately don't take
 * a hard dependency on @sentry/nextjs until we've picked a vendor and
 * paid for it; until then this layer console.errors so prod failures
 * are at least visible in Vercel logs.
 *
 * To wire Sentry:
 *   1. pnpm --filter web add @sentry/nextjs
 *   2. Run `npx @sentry/wizard@latest -i nextjs` (creates instrumentation.ts +
 *      sentry.client.config.ts + sentry.server.config.ts)
 *   3. Replace the body of `reportError` below with `Sentry.captureException`
 *   4. Replace the body of `addBreadcrumb` below with `Sentry.addBreadcrumb`
 *   5. Set SENTRY_DSN in production env (the wizard prompts for this)
 *
 * Until then: errors fall through to console.error which Vercel
 * captures into runtime logs (queryable from the Vercel dashboard).
 */

type Severity = "fatal" | "error" | "warning" | "info" | "debug";

export type ErrorContext = {
  userId?: string | null;
  orgId?: string | null;
  agencyId?: string | null;
  operation?: string;
  extra?: Record<string, unknown>;
  tags?: Record<string, string>;
};

export function reportError(error: unknown, context: ErrorContext = {}): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  console.error("[observability]", {
    message,
    stack,
    ...context,
    timestamp: new Date().toISOString(),
  });
}

export function addBreadcrumb(args: {
  category: string;
  message: string;
  level?: Severity;
  data?: Record<string, unknown>;
}): void {
  // No-op until Sentry is wired up. We don't console-log breadcrumbs by
  // default — they'd dominate the runtime log output.
  if (process.env["OBSERVABILITY_DEBUG"] === "true") {
    console.debug("[breadcrumb]", args);
  }
}

/**
 * Wraps a function so any thrown error is reported with the given
 * context, then re-thrown. Use sparingly — server actions should
 * already catch + return ActionResult; this is for fire-and-forget
 * background work like webhook deliveries.
 */
export async function withErrorReporting<T>(
  context: ErrorContext,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    reportError(err, context);
    throw err;
  }
}
