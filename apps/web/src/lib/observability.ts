import "server-only";

import * as Sentry from "@sentry/nextjs";

/**
 * Thin error-reporting + breadcrumb abstraction over Sentry.
 *
 * Sentry is initialized in `instrumentation.ts` (server/edge) and
 * `instrumentation-client.ts` (browser), gated on SENTRY_DSN /
 * NEXT_PUBLIC_SENTRY_DSN. When no DSN is configured, Sentry's calls are no-ops
 * and we fall back to console.error so prod failures stay visible in Vercel
 * logs. The vendor stays swappable behind this one file.
 */

type Severity = "fatal" | "error" | "warning" | "info" | "debug";

const sentryEnabled = Boolean(process.env.SENTRY_DSN);

export type ErrorContext = {
  userId?: string | null;
  orgId?: string | null;
  agencyId?: string | null;
  operation?: string;
  extra?: Record<string, unknown>;
  tags?: Record<string, string>;
};

export function reportError(error: unknown, context: ErrorContext = {}): void {
  if (sentryEnabled) {
    Sentry.withScope((scope) => {
      if (context.userId) scope.setUser({ id: context.userId });
      if (context.orgId) scope.setTag("orgId", context.orgId);
      if (context.agencyId) scope.setTag("agencyId", context.agencyId);
      if (context.operation) scope.setTag("operation", context.operation);
      if (context.tags) {
        for (const [k, v] of Object.entries(context.tags)) scope.setTag(k, v);
      }
      if (context.extra) scope.setExtras(context.extra);
      Sentry.captureException(error);
    });
    return;
  }
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
  if (sentryEnabled) {
    Sentry.addBreadcrumb({
      category: args.category,
      message: args.message,
      level: args.level ?? "info",
      ...(args.data ? { data: args.data } : {}),
    });
    return;
  }
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
