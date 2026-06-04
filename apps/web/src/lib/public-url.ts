import "server-only";
import { headers } from "next/headers";

/**
 * Canonical base URL for links an external, logged-out person must reach —
 * QR feedback, public intake, invitation accepts. Prefers NEXT_PUBLIC_APP_URL
 * so a link is never minted against a protected Vercel preview/deployment host
 * (which would dump the recipient on Vercel's login wall). Falls back to the
 * request host, then localhost in dev.
 *
 * When a custom domain is added, set NEXT_PUBLIC_APP_URL to it in one place and
 * redeploy — every public link follows.
 */
export async function getPublicBaseUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
