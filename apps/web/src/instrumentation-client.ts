// Sentry browser initialization. Inert until NEXT_PUBLIC_SENTRY_DSN is set.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "production",
  });
}

// Captures client-side navigation errors for Next's App Router.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
