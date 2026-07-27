import type { NextConfig } from "next";

// Supabase is reached from the browser (auth + PostgREST + realtime), so its
// origin has to be allowed in connect-src. Derive it from the same env var the
// client uses rather than hardcoding the project ref.
const supabaseOrigin = (() => {
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
})();

const connectSrc = [
  "'self'",
  supabaseOrigin,
  supabaseOrigin?.replace(/^https:/, "wss:"),
  // Sentry ingest. Only reached when NEXT_PUBLIC_SENTRY_DSN is set.
  "https://*.ingest.sentry.io",
  "https://*.ingest.us.sentry.io",
  // Vercel Speed Insights / Web Analytics beacons.
  "https://vitals.vercel-insights.com",
]
  .filter(Boolean)
  .join(" ");

// `unsafe-inline` in script-src is required because the App Router emits inline
// bootstrap/flight scripts and the root layout sets the theme pre-paint from a
// cookie. The nonce alternative means calling headers() in the root layout,
// which would force every currently-static marketing page to render dynamically.
// The directive still blocks third-party script origins, which is where the
// realistic XSS payload delivery would come from. `unsafe-eval` is dev-only
// (Turbopack's HMR runtime needs it); production gets no eval.
const isDev = process.env.NODE_ENV === "development";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // data: for generated QR codes, blob: for client-built PDF/XLSX downloads,
  // https: for agency-supplied white-label logos on arbitrary CDNs.
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src ${connectSrc}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // 2 years + subdomains. Deliberately no `preload`: submitting to the browser
  // preload list is effectively irreversible and would strand any http-only
  // subdomain (status page, agency vanity host) with no way back.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Redundant with frame-ancestors for modern browsers; kept for older ones.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  // Don't advertise the framework version to scanners.
  poweredByHeader: false,
  headers() {
    return Promise.resolve([{ source: "/:path*", headers: securityHeaders }]);
  },
};

export default nextConfig;
