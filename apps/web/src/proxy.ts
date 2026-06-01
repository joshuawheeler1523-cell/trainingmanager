import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { isAllowedPath, skipOrgCheck } from "@/lib/auth/is-allowed-path";

const SUPABASE_URL = process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? "";
const SUPABASE_ANON_KEY = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] ?? "";

// White-Label Phase 3: per-isolate cache of {host → agency} mappings.
// Custom-domain rows change rarely, but a long-lived isolate would keep
// stale mappings indefinitely after an agency removes/changes their
// domain. 60s TTL bounds that risk to a minute of brand mis-routing
// after a removal — acceptable since the alternative is one Supabase
// round-trip per request.
type HostMatch = { agencyId: string; slug: string; name: string };
type CacheEntry = { value: HostMatch | null; expiresAt: number };
const HOST_CACHE = new Map<string, CacheEntry>();
const HOST_CACHE_MAX = 256;
const HOST_CACHE_TTL_MS = 60_000;

function setCached(host: string, value: HostMatch | null): void {
  if (HOST_CACHE.size >= HOST_CACHE_MAX) {
    const firstKey = HOST_CACHE.keys().next().value;
    if (firstKey !== undefined) HOST_CACHE.delete(firstKey);
  }
  HOST_CACHE.set(host, { value, expiresAt: Date.now() + HOST_CACHE_TTL_MS });
}

async function lookupAgencyByHost(host: string): Promise<HostMatch | null> {
  const cached = HOST_CACHE.get(host);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) HOST_CACHE.delete(host);

  const client = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = (await client.rpc("lookup_agency_by_domain", { p_host: host })) as {
    data: { id: string; slug: string; name: string }[] | null;
  };
  const row = data?.[0] ?? null;
  const value: HostMatch | null = row ? { agencyId: row.id, slug: row.slug, name: row.name } : null;
  setCached(host, value);
  return value;
}

export async function proxy(request: NextRequest) {
  // ── Phase 3: Custom-domain → agency lookup ───────────────────────────────
  // If the Host header matches a verified agency.custom_domain, set
  // x-agency-id / x-agency-slug / x-agency-name on the request so downstream
  // server components (e.g. login page) can scope branding without re-running
  // the lookup. Skip on localhost + *.vercel.app to dodge a needless RPC.
  const rawHost = request.headers.get("host")?.toLowerCase();
  // Strip port. Bracketed IPv6 hosts ([::1]:3000) just won't match an
  // agency — we don't host on raw IPs.
  const host = rawHost?.replace(/:\d+$/, "") ?? null;
  let agencyMatch: HostMatch | null = null;
  if (host && host !== "localhost" && !host.endsWith(".vercel.app") && !host.startsWith("[")) {
    agencyMatch = await lookupAgencyByHost(host);
  }
  // Always clear any inbound x-agency-* headers so an attacker can't
  // spoof them via a request to a non-agency host. Then set them only
  // when the host actually matched a verified agency.
  request.headers.delete("x-agency-id");
  request.headers.delete("x-agency-slug");
  request.headers.delete("x-agency-name");
  if (agencyMatch) {
    request.headers.set("x-agency-id", agencyMatch.agencyId);
    request.headers.set("x-agency-slug", agencyMatch.slug);
    request.headers.set("x-agency-name", agencyMatch.name);
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Unauthenticated: redirect to /login for protected routes
  if (!user && !isAllowedPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Authenticated visits to / or /login go to the dashboard. The marketing
  // page at / is for unauthenticated visitors.
  if (user && (pathname === "/" || pathname === "/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // Authenticated but no accepted org membership: agency members belong in the
  // agency console, not org onboarding. Route them there; everyone else with no
  // org goes to /onboarding.
  if (user && !skipOrgCheck(pathname)) {
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("org_id")
      .limit(1)
      .maybeSingle();

    if (!membership) {
      const { data: agencyMembership } = await supabase
        .from("agency_memberships")
        .select("agency_id")
        .limit(1)
        .maybeSingle();

      const url = request.nextUrl.clone();
      url.pathname = agencyMembership ? "/agency" : "/onboarding";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
