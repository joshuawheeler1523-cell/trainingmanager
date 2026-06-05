// Sentry server + edge initialization. Inert until SENTRY_DSN is set in the
// environment, so this is safe to ship before a Sentry project exists (errors
// then fall back to console -> Vercel logs, as before).
import * as Sentry from "@sentry/nextjs";

export function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  });
}

// Next.js invokes this for every uncaught error in a server request, route
// handler, or server action — forwarding them all to Sentry automatically.
export const onRequestError = Sentry.captureRequestError;
